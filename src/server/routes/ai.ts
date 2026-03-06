/**
 * AI proxy route
 *
 * POST /api/ai/stream
 * Body: { messages: AIMessage[], preferences: string[], compressedMemory?: string, isOnboarding?: boolean }
 * Response: text/event-stream (SSE)
 *
 * Reads API key from the config table, forwards the request to Kimi/OpenAI,
 * and streams the response back to the browser as SSE events.
 *
 * SSE event format:
 *   data: {"type":"content","content":"..."}
 *   data: {"type":"reasoning","content":"..."}
 *   data: {"type":"done","fullText":"..."}
 *   data: {"type":"error","message":"..."}
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type Database from 'better-sqlite3'
import {
  DEFAULT_SYSTEM_PROMPT, ONBOARDING_SYSTEM_PROMPT, AI_CONFIG, MULTIMODAL_MODELS,
  FAST_MODEL, FAST_MODEL_MAX_TOKENS, SIMPLE_QUERY_GREETINGS
} from '../../shared/constants'
import type { AIMessage } from '../../shared/types'

export const aiRoutes = new Hono()

/** Get the per-user database from request context */
function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

// ── Token 预算工具 ───────────────────────────────────────────────────────────
const CONTEXT_BUDGET = 1500  // system prompt 注入层总 token 预算
/**
 * 近似 token 数：区分 CJK（每字 ≈2 token）与拉丁字符（4字符 ≈1 token）
 * 比纯 chars/4 对中文文本误差从 8x 降至 <1.5x
 */
function approxTokens(text: string): number {
  let count = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK 基本区
      (code >= 0x3400 && code <= 0x4DBF) ||  // CJK 扩展 A
      (code >= 0xF900 && code <= 0xFAFF) ||  // CJK 兼容汉字
      (code >= 0x3000 && code <= 0x303F) ||  // CJK 符号和标点
      (code >= 0xFF00 && code <= 0xFFEF)     // 全角字符
    ) {
      count += 2  // CJK 字符保守上界
    } else {
      count += 0.25  // 英文/数字/ASCII 标点：4字符 ≈ 1 token
    }
  }
  return Math.ceil(count)
}

// ── 服务端语义搜索（直接访问 DB + embedding，不走 HTTP 环回）────────────────
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ── FTS5 BM25 fallback（embedding 不可用时） ──────────────────────────────────
function bm25FallbackFacts(db: InstanceType<typeof Database>, query: string): string[] {
  try {
    const terms = query
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2)
      .slice(0, 8)
      .join(' OR ')
    if (!terms) return []
    return (db.prepare(`
      SELECT f.fact
      FROM memory_facts_fts fts
      JOIN memory_facts f ON f.id = fts.id
      WHERE memory_facts_fts MATCH ?
        AND f.invalid_at IS NULL
      ORDER BY rank
      LIMIT 10
    `).all(terms) as { fact: string }[]).map(r => r.fact)
  } catch { return [] }
}

async function fetchRelevantFacts(db: InstanceType<typeof Database>, query: string, apiKey: string, baseUrl: string): Promise<string[]> {
  if (!query.trim() || !apiKey) return []
  try {
    const isMoonshot = baseUrl.includes('moonshot')
    const embModel = isMoonshot ? 'moonshot-v1-embedding' : 'text-embedding-3-small'
    const embResp = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: embModel, input: query.slice(0, 500) }),
      signal: AbortSignal.timeout(5_000)
    })
    if (!embResp.ok) return bm25FallbackFacts(db, query)
    const embData = (await embResp.json()) as { data: { embedding: number[] }[] }
    const queryVec = embData?.data?.[0]?.embedding
    if (!Array.isArray(queryVec) || queryVec.length === 0) return bm25FallbackFacts(db, query)

    const queryF32 = new Float32Array(queryVec)

    const facts = db.prepare(
      'SELECT id, fact, source_conv_id FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 100'
    ).all() as { id: string; fact: string; source_conv_id: string | null }[]
    if (facts.length === 0) return []

    const embRows = db.prepare(
      'SELECT conversation_id, vector FROM embeddings ORDER BY updated_at DESC LIMIT 500'
    ).all() as
      { conversation_id: string; vector: Buffer }[]
    const embMap = new Map(embRows.map(r => [r.conversation_id, r.vector]))

    const scored = facts.map(f => {
      const vecBuf = f.source_conv_id ? embMap.get(f.source_conv_id) : undefined
      let score = 0
      if (vecBuf) {
        const vec = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.byteLength / 4)
        score = cosineSim(queryF32, vec)
      }
      // 无 embedding 向量的 fact 直接 score=0，会被 filter 过滤
      return { fact: f.fact, score }
    })
    .filter(r => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.fact)

    return scored
  } catch {
    return bm25FallbackFacts(db, query)
  }
}

interface AIRequestBody {
  messages: AIMessage[]
  preferences?: string[]
  compressedMemory?: string
  isOnboarding?: boolean
}

aiRoutes.post('/stream', async (c) => {
  const db = userDb(c)
  const body = await c.req.json<AIRequestBody>()
  const { messages, preferences = [], compressedMemory, isOnboarding = false } = body

  // Retrieve API key from DB
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = row?.value ?? ''

  // 引导模式下，若无用户 key，使用演示 key（仅供新手引导消耗）
  const effectiveApiKey = isOnboarding && !apiKey
    ? (process.env.ONBOARDING_API_KEY ?? '')
    : apiKey

  if (!effectiveApiKey) {
    return c.json({ error: 'API Key 未配置，请在设置中填写' }, 400)
  }

  const modelRow = db.prepare('SELECT value FROM config WHERE key = ?').get('model') as
    | { value: string }
    | undefined
  const configuredModel = modelRow?.value ?? AI_CONFIG.MODEL

  // 智能路由：仅纯问候语（不含实质内容）使用快速模型，其余走用户配置模型
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()
  const lastText = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : (Array.isArray(lastUserMsg?.content)
        ? (lastUserMsg!.content as any[]).find(c => c.type === 'text')?.text ?? ''
        : '')
  const trimmedText = lastText.trim()
  const GREETING_SUFFIX = /^[！!~～。，,？?。\s]*$/
  const SIMPLE_META_PATTERNS = [
    /^你是谁[？?！!\s]*$/,
    /^你是做什么的[？?！!\s]*$/,
    /^你能帮我(做什么|干什么|干嘛)[？?！!\s]*$/,
    /^你会什么[？?！!\s]*$/,
    /^你可以帮我(什么|做什么|干什么)[？?！!\s]*$/,
    /^在吗[？?！!\s]*$/,
    /^hello[!?.\s]*$/i,
    /^hi[!?.\s]*$/i
  ]
  const isMetaSimpleQuery = SIMPLE_META_PATTERNS.some(pattern => pattern.test(trimmedText))
  const isShortPlainQuestion = trimmedText.length > 0 && trimmedText.length <= 12 && !/[，。；：,\n]/.test(trimmedText)
  const isSimpleQuery = isOnboarding ||
    isMetaSimpleQuery ||
    SIMPLE_QUERY_GREETINGS.some(w =>
      trimmedText === w ||
      (trimmedText.startsWith(w) && GREETING_SUFFIX.test(trimmedText.slice(w.length)))
    ) ||
    (isShortPlainQuestion && /^(谁|啥|吗|么|呢|呀|？|\?)$/.test(trimmedText.slice(-1)))

  const model = isSimpleQuery ? FAST_MODEL : configuredModel
  const maxTokens = isSimpleQuery ? FAST_MODEL_MAX_TOKENS : AI_CONFIG.MAX_TOKENS

  const baseUrlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as
    | { value: string }
    | undefined
  const baseUrl = (baseUrlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')

  // 注入当前日期
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  // 选择 system prompt：引导模式用轻量版，不注入偏好和记忆
  let systemPrompt: string
  if (isOnboarding) {
    systemPrompt = ONBOARDING_SYSTEM_PROMPT.replace('{{DATE}}', today)
  } else {
    systemPrompt = DEFAULT_SYSTEM_PROMPT.replace('{{DATE}}', today)
    let contextTokensUsed = 0

    // ── 层 1（最高优先级）：进化基因（偏好规则）── 前端传入 + 后端 Agent 提取合并
    try {
      const agentRulesRow = db.prepare('SELECT value FROM config WHERE key = ?').get('preference_rules') as { value: string } | undefined
      const agentPrefs: string[] = agentRulesRow?.value
        ? (JSON.parse(agentRulesRow.value) as { preference: string; confidence?: number }[])
            .filter(r => (r.confidence ?? 0.7) > 0.5)
            .map(r => r.preference)
        : []
      const allPreferences = [...new Set([...preferences, ...agentPrefs])]
      if (allPreferences.length > 0) {
        const block = '\n\n【用户进化基因 - 请严格遵守】\n' + allPreferences.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n'
        const cost = approxTokens(block)
        if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
          systemPrompt += block
          contextTokensUsed += cost
        }
      }
    } catch { /* 偏好注入失败不影响主流程 */ }

    // ── 层 2：用户画像 ──
    try {
      const profile = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined
      if (profile) {
        const parts: string[] = []
        if (profile.occupation) parts.push(`职业：${profile.occupation}`)
        if (profile.location) parts.push(`位置：${profile.location}`)
        try {
          if (profile.interests) { const arr = JSON.parse(profile.interests) as string[]; if (arr.length) parts.push(`兴趣：${arr.join('、')}`) }
          if (profile.tools) { const arr = JSON.parse(profile.tools) as string[]; if (arr.length) parts.push(`常用工具：${arr.join('、')}`) }
          if (profile.goals) { const arr = JSON.parse(profile.goals) as string[]; if (arr.length) parts.push(`当前关注：${arr.join('、')}`) }
        } catch { /* JSON 字段损坏时跳过 */ }
        if (profile.writing_style) parts.push(`偏好回答风格：${profile.writing_style}`)
        if (parts.length > 0) {
          const block = '\n\n【用户画像 - 请据此个性化回答】\n' + parts.join('\n')
          const cost = approxTokens(block)
          if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
            systemPrompt += block
            contextTokensUsed += cost
          }
        }
      }
    } catch { /* 画像注入失败不影响主流程 */ }

    // ── 层 3：记忆事实（语义检索 > BM25 > 最近 N 条降级）──
    try {
      let relevantFacts: string[] = []
      if (trimmedText.length > 5) {
        relevantFacts = await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
      }
      // 语义检索无结果时降级：BM25 FTS5
      if (relevantFacts.length === 0 && trimmedText.length > 5) {
        relevantFacts = bm25FallbackFacts(db, trimmedText)
      }
      // 最终 fallback：最近 10 条有效事实（节省 token）
      if (relevantFacts.length === 0) {
        const rows = db.prepare(
          'SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 10'
        ).all() as { fact: string }[]
        relevantFacts = rows.map(r => r.fact)
      }
      if (relevantFacts.length > 0) {
        const block = '\n\n【关于用户的记忆事实 - 请据此个性化回答】\n' + relevantFacts.map((f, i) => `${i + 1}. ${f}`).join('\n') + '\n'
        const cost = approxTokens(block)
        if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
          systemPrompt += block
          contextTokensUsed += cost
        }
      }
    } catch { /* 事实注入失败不影响主流程 */ }

    // ── 层 4（最低优先级）：前端传入的压缩记忆片段 ──
    if (compressedMemory?.trim()) {
      const block = '\n\n【相关记忆片段 - 供参考】\n' + compressedMemory.trim()
      const cost = approxTokens(block)
      if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
        systemPrompt += block
      }
    }
  }

  const fullMessages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  const requestBody: Record<string, unknown> = {
    model,
    messages: fullMessages,
    max_tokens: maxTokens,
    temperature: AI_CONFIG.TEMPERATURE,
    stream: true
  }

  // Enable web search for capable models (only non-simple queries)
  if (!isSimpleQuery && MULTIMODAL_MODELS.includes(model as typeof MULTIMODAL_MODELS[number])) {
    requestBody.tools = [{ type: 'builtin_function', function: { name: '$web_search' } }]
  }

  return streamSSE(c, async (stream) => {
    let fullContent = ''
    let reasoningContent = ''
    const toolCalls: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}

    const sendEvent = async (data: Record<string, unknown>) => {
      await stream.writeSSE({ data: JSON.stringify(data) })
    }

    const fetchCompletionStream = async (body: Record<string, unknown>) => {
      return fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify(body),
        signal: c.req.raw.signal
      })
    }

    try {
      let response: Response
      try {
        response = await fetchCompletionStream(requestBody)
      } catch (error) {
        const shouldRetryWithoutTools = Boolean(requestBody.tools)
        if (!shouldRetryWithoutTools) throw error
        const fallbackBody = { ...requestBody }
        delete fallbackBody.tools
        response = await fetchCompletionStream(fallbackBody)
      }

      if (!response.ok) {
        const errorText = await response.text()
        await sendEvent({ type: 'error', message: `API error ${response.status}: ${errorText}` })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        await sendEvent({ type: 'error', message: 'No response body from upstream' })
        return
      }

      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const decodedChunk = decoder.decode(value, { stream: true })
        sseBuffer += decodedChunk
        const parts = sseBuffer.split(/\r?\n\r?\n/)
        sseBuffer = parts.pop() ?? ''

        for (const part of parts) {
          for (const line of part.split(/\r?\n/)) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            const finishReason = parsed.choices?.[0]?.finish_reason

            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              await sendEvent({ type: 'reasoning', content: delta.reasoning_content })
            }

            if (delta?.content) {
              fullContent += delta.content
              await sendEvent({ type: 'content', content: delta.content })
            }

            // Accumulate tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx: number = tc.index
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    id: tc.id,
                    type: tc.type,
                    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' }
                  }
                } else {
                  if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
                  if (tc.function?.arguments) {
                    toolCalls[idx].function.arguments += tc.function.arguments
                  }
                }
              }
            }

            // Handle tool call completion - trigger second round
            if (finishReason === 'tool_calls' && Object.keys(toolCalls).length > 0) {
              const toolCallsArray = Object.values(toolCalls)

              const assistantMsg: AIMessage = {
                role: 'assistant',
                content: fullContent || '',
                tool_calls: toolCallsArray,
                reasoning_content: reasoningContent || 'web_search'
              }

              const toolMessages: AIMessage[] = toolCallsArray.map((tc) => ({
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: tc.function.arguments
              }))

              // Second round request
              const round2Body: Record<string, unknown> = {
                model,
                messages: [...fullMessages, assistantMsg, ...toolMessages],
                max_tokens: AI_CONFIG.MAX_TOKENS,
                temperature: AI_CONFIG.TEMPERATURE,
                stream: true
              }

              const round2Res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${effectiveApiKey}`
                },
                body: JSON.stringify(round2Body),
                signal: c.req.raw.signal
              })

              if (round2Res.ok) {
                const reader2 = round2Res.body?.getReader()
                if (reader2) {
                  let sseBuffer2 = ''
                  while (true) {
                    const { done, value } = await reader2.read()
                    if (done) break
                    sseBuffer2 += decoder.decode(value, { stream: true })
                    const parts2 = sseBuffer2.split(/\r?\n\r?\n/)
                    sseBuffer2 = parts2.pop() ?? ''
                    for (const part2 of parts2) {
                      for (const line2 of part2.split(/\r?\n/)) {
                      if (!line2.startsWith('data: ')) continue
                      const data2 = line2.slice(6)
                      if (data2 === '[DONE]') continue
                      try {
                        const p2 = JSON.parse(data2)
                        const d2 = p2.choices?.[0]?.delta
                        if (d2?.reasoning_content) {
                          reasoningContent += d2.reasoning_content
                          await sendEvent({ type: 'reasoning', content: d2.reasoning_content })
                        }
                        if (d2?.content) {
                          fullContent += d2.content
                          await sendEvent({ type: 'content', content: d2.content })
                        }
                      } catch {
                        // ignore parse errors
                      }
                    }
                    }
                  }
                }
              }
            }
          } catch {
            // ignore JSON parse errors in stream
          }
          }
        }
      }

      await sendEvent({ type: 'done', fullText: fullContent })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await sendEvent({ type: 'done', fullText: fullContent })
        return
      }
      await sendEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
})

/**
 * POST /api/ai/summarize
 * Body: { userMessage: string, assistantMessage: string }
 * Response: { title: string }
 *
 * 用一句话总结对话核心决策/结论，用于节点标题回写。
 */
aiRoutes.post('/summarize', async (c) => {
  const db = userDb(c)
  const { userMessage, assistantMessage } = await c.req.json<{
    userMessage: string
    assistantMessage: string
  }>()

  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = row?.value ?? ''
  if (!apiKey) return c.json({ title: null, error: 'API Key 未配置' }, 400)

  const baseUrlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as
    | { value: string }
    | undefined
  const baseUrl = (baseUrlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')

  const prompt = `请用一句话（10字以内）总结以下对话的核心问题或结论，只输出标题，不加标点：\n\n用户：${userMessage.slice(0, 200)}\nAI：${assistantMessage.slice(0, 300)}`

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: FAST_MODEL,
        max_tokens: 30,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      }),
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) return c.json({ title: null })
    const data = await response.json() as any
    const title = data.choices?.[0]?.message?.content?.trim() ?? null
    return c.json({ title })
  } catch {
    return c.json({ title: null })
  }
})
