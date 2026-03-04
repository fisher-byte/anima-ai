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
import { db } from '../db'
import {
  DEFAULT_SYSTEM_PROMPT, ONBOARDING_SYSTEM_PROMPT, AI_CONFIG, MULTIMODAL_MODELS,
  FAST_MODEL, FAST_MODEL_MAX_TOKENS, SIMPLE_QUERY_GREETINGS
} from '../../shared/constants'
import type { AIMessage } from '../../shared/types'

export const aiRoutes = new Hono()

// ── Token 预算工具（字符数 / 4 近似 token 数）────────────────────────────────
const CONTEXT_BUDGET = 1500  // system prompt 注入层总 token 预算
function approxTokens(text: string): number { return Math.ceil(text.length / 4) }

// ── 服务端语义搜索（直接访问 DB + embedding，不走 HTTP 环回）────────────────
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function fetchRelevantFacts(query: string, apiKey: string, baseUrl: string): Promise<string[]> {
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
    if (!embResp.ok) return []
    const embData = (await embResp.json()) as { data: { embedding: number[] }[] }
    const queryVec = embData?.data?.[0]?.embedding
    if (!Array.isArray(queryVec) || queryVec.length === 0) return []

    const queryF32 = new Float32Array(queryVec)

    // 读取所有有效（未失效）事实 + 对应向量
    // 先查 memory_facts，再做向量打分
    const facts = db.prepare(
      'SELECT id, fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 100'
    ).all() as { id: string; fact: string }[]
    if (facts.length === 0) return []

    // 读取这些 fact 的向量（以 source_conv_id 关联；fact 无独立向量时降级用 embeddings 表）
    // 实用方案：对 fact 文本直接做余弦打分，避免额外 embed 存储
    // 直接用 fact 文本与 query 的 BM25 近似：字符级 Jaccard 相似度作为轻量 fallback
    // 若有对应 conv 的 embedding 则用真向量，否则用文本近似
    const embRows = db.prepare('SELECT conversation_id, vector FROM embeddings').all() as
      { conversation_id: string; vector: Buffer }[]
    const embMap = new Map(embRows.map(r => [r.conversation_id, r.vector]))

    const scored = facts.map(f => {
      // 优先用 source_conv 向量
      const factRow = db.prepare('SELECT source_conv_id FROM memory_facts WHERE id = ?').get(f.id) as
        { source_conv_id: string | null } | undefined
      const vecBuf = factRow?.source_conv_id ? embMap.get(factRow.source_conv_id) : undefined
      let score = 0
      if (vecBuf) {
        const vec = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.byteLength / 4)
        score = cosineSim(queryF32, vec)
      } else {
        // 降级：字符级 Jaccard 作为近似
        const qChars = new Set(query.toLowerCase().replace(/\s/g, ''))
        const fChars = new Set(f.fact.toLowerCase().replace(/\s/g, ''))
        const inter = [...qChars].filter(c => fChars.has(c)).length
        const union = new Set([...qChars, ...fChars]).size
        score = union > 0 ? inter / union : 0
      }
      return { fact: f.fact, score }
    })
    .filter(r => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.fact)

    return scored
  } catch {
    // 语义检索失败时降级到最近 N 条
    return []
  }
}

interface AIRequestBody {
  messages: AIMessage[]
  preferences?: string[]
  compressedMemory?: string
  isOnboarding?: boolean
}

aiRoutes.post('/stream', async (c) => {
  const body = await c.req.json<AIRequestBody>()
  const { messages, preferences = [], compressedMemory, isOnboarding = false } = body

  // Retrieve API key from DB
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = row?.value ?? ''

  if (!apiKey) {
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
  // 仅当消息本身就是一个问候词（允许末尾一个标点/语气词）时才走快速模型
  // 例：「你好」「hi！」「早~」匹配；「你好吗」「hi，帮我...」不匹配
  const GREETING_SUFFIX = /^[！!~～。，,？?。\s]*$/
  const isSimpleQuery = isOnboarding ||
    SIMPLE_QUERY_GREETINGS.some(w =>
      trimmedText === w ||
      (trimmedText.startsWith(w) && GREETING_SUFFIX.test(trimmedText.slice(w.length)))
    )

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

    // ── 层 3：记忆事实（语义检索 > 最近 N 条降级）──
    try {
      let relevantFacts: string[] = []
      if (trimmedText.length > 5) {
        relevantFacts = await fetchRelevantFacts(trimmedText, apiKey, baseUrl)
      }
      // 语义检索无结果时降级：最近 15 条有效事实
      if (relevantFacts.length === 0) {
        const rows = db.prepare(
          'SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 15'
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

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: c.req.raw.signal
      })

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter((l) => l.trim() !== '')

        for (const line of lines) {
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
                  Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify(round2Body),
                signal: c.req.raw.signal
              })

              if (round2Res.ok) {
                const reader2 = round2Res.body?.getReader()
                if (reader2) {
                  while (true) {
                    const { done, value } = await reader2.read()
                    if (done) break
                    const chunk2 = decoder.decode(value, { stream: true })
                    for (const line2 of chunk2.split('\n').filter((l) => l.trim())) {
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
          } catch {
            // ignore JSON parse errors in stream
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
