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
import { enqueueTask } from '../agentWorker'

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
  conversationId?: string
  /** 若传入，完全覆盖默认 system prompt，不注入用户偏好/画像/记忆 */
  systemPromptOverride?: string
}

// ── 每用户每日限流（共享 key 模式，按 token 费用计算）──────────────────────────
// moonshot-v1-8k: ¥0.012 / 千token（输入输出同价）
// 默认每日上限 ¥5 ≈ 416,666 tokens（可通过 DAILY_LIMIT_YUAN 调整）
const PRICE_PER_1K_TOKENS = 0.012 // 元
function getDailyTokenLimit(): number {
  const yuan = parseFloat(process.env.DAILY_LIMIT_YUAN ?? '5')
  return Math.round((yuan / PRICE_PER_1K_TOKENS) * 1000)
}

function checkDailyBudget(db: InstanceType<typeof Database>): { allowed: boolean; usedYuan: number; limitYuan: number } {
  const limitTokens = getDailyTokenLimit()
  const limitYuan = parseFloat(process.env.DAILY_LIMIT_YUAN ?? '5')
  const today = new Date().toISOString().slice(0, 10)
  const key = `daily_tokens_${today}`
  try {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    const usedTokens = row ? parseInt(row.value, 10) : 0
    const usedYuan = parseFloat(((usedTokens / 1000) * PRICE_PER_1K_TOKENS).toFixed(4))
    return { allowed: usedTokens < limitTokens, usedYuan, limitYuan }
  } catch {
    return { allowed: true, usedYuan: 0, limitYuan }
  }
}

function addDailyTokens(db: InstanceType<typeof Database>, tokens: number): void {
  if (tokens <= 0) return
  const today = new Date().toISOString().slice(0, 10)
  const key = `daily_tokens_${today}`
  const now = new Date().toISOString()
  try {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    if (row) {
      db.prepare("UPDATE config SET value = ?, updated_at = ? WHERE key = ?")
        .run(String(parseInt(row.value, 10) + tokens), now, key)
    } else {
      db.prepare("INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)").run(key, String(tokens), now)
    }
  } catch { /* 失败时静默，不阻断 */ }
}

// POST /stream body 上限：20MB（含图片 base64，单张图片约 5~8MB）
const MAX_STREAM_BODY = 20 * 1024 * 1024

aiRoutes.post('/stream', async (c) => {
  const db = userDb(c)
  const rawBody = await c.req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_STREAM_BODY) {
    return c.json({ error: '请求体过大，最大支持 20MB（单次请求图片数量过多或消息过长）' }, 413)
  }
  const body = JSON.parse(rawBody) as AIRequestBody
  const { messages, preferences = [], compressedMemory, isOnboarding = false, conversationId, systemPromptOverride } = body

  // ── API Key 解析：用户自己的 key → 共享 key → 报错 ──────────────────────────
  const userKeyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = userKeyRow?.value ?? ''

  const sharedApiKey = process.env.SHARED_API_KEY ?? process.env.ONBOARDING_API_KEY ?? ''
  const usingSharedKey = !apiKey && !!sharedApiKey

  // 引导模式 / 使用共享 key 时检查限流
  const effectiveApiKey = apiKey || sharedApiKey

  if (!effectiveApiKey) {
    return c.json({ error: 'API Key 未配置，请在设置中填写' }, 400)
  }

  // 仅使用共享 key 时做限流（有自己 key 的用户不受限）
  if (usingSharedKey && !isOnboarding) {
    const { allowed, usedYuan, limitYuan } = checkDailyBudget(db)
    if (!allowed) {
      return c.json({
        error: `今日免费额度已用完（已用 ¥${usedYuan.toFixed(2)} / 上限 ¥${limitYuan}）。请在右上角设置中填写自己的 API Key 继续使用。`
      }, 429)
    }
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

  // 选择 system prompt：override 模式直接使用（跳过用户数据注入）
  let systemPrompt: string
  if (systemPromptOverride) {
    systemPrompt = systemPromptOverride.replace('{{DATE}}', today)
  } else if (isOnboarding) {
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

    // ── 层 3：记忆事实（语义检索 > BM25 > 最近 N 条降级）── 动态内容优先于静态摘要
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

    // ── 层 2.5（心智模型，静态摘要）── 刻意置于层 3 动态事实之后，确保动态内容优先占用 CONTEXT_BUDGET
    try {
      const mmRow = db.prepare('SELECT model_json FROM user_mental_model WHERE id = 1').get() as { model_json: string } | undefined
      if (mmRow?.model_json) {
        const mm = JSON.parse(mmRow.model_json) as Record<string, unknown>
        const parts: string[] = []
        if (Array.isArray(mm['认知框架']) && (mm['认知框架'] as string[]).length > 0)
          parts.push(`认知框架：${(mm['认知框架'] as string[]).join('、')}`)
        if (Array.isArray(mm['长期目标']) && (mm['长期目标'] as string[]).length > 0)
          parts.push(`长期目标：${(mm['长期目标'] as string[]).join('、')}`)
        if (Array.isArray(mm['思维偏好']) && (mm['思维偏好'] as string[]).length > 0)
          parts.push(`思维偏好：${(mm['思维偏好'] as string[]).join('、')}`)
        if (mm['领域知识'] && typeof mm['领域知识'] === 'object' && !Array.isArray(mm['领域知识'])) {
          const entries = Object.entries(mm['领域知识'] as Record<string, string>)
          if (entries.length > 0) parts.push(`领域知识：${entries.map(([d, l]) => `${d}(${l})`).join('、')}`)
        }
        if (Array.isArray(mm['情绪模式']) && (mm['情绪模式'] as string[]).length > 0)
          parts.push(`情绪模式：${(mm['情绪模式'] as string[]).join('、')}`)
        if (parts.length > 0) {
          const block = '\n\n【用户心智模型 - 请据此深度个性化】\n' + parts.join('\n')
          const cost = approxTokens(block)
          if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
            systemPrompt += block
            contextTokensUsed += cost
          }
        }
      }
    } catch { /* 心智模型注入失败不影响主流程 */ }

    // ── 层 2.7（跨节点逻辑推理）──
    try {
      if (conversationId) {
        const relatedEdges = db.prepare(`
          SELECT relation, reason
          FROM logical_edges
          WHERE (source_conv = ? OR target_conv = ?) AND confidence >= 0.6
          ORDER BY confidence DESC LIMIT 5
        `).all(conversationId, conversationId) as Array<{ relation: string; reason: string }>

        if (relatedEdges.length > 0) {
          const block = '\n\n【与本话题相关的逻辑脉络（请在回答中主动关联）】\n'
            + relatedEdges.map((e, i) => `${i + 1}. ${e.relation}：${e.reason.slice(0, 60)}`).join('\n')
          const cost = approxTokens(block)
          if (contextTokensUsed + cost <= CONTEXT_BUDGET) {
            systemPrompt += block
            contextTokensUsed += cost
          }
        }
      }
    } catch { /* 静默失败 */ }

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

    /**
     * 读取单轮流式响应，返回本轮累积的 tool_calls（如果有）和 finish_reason。
     * content / reasoning 增量会直接通过 sendEvent 推送给前端。
     */
    const readRound = async (res: Response): Promise<{
      toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      finishReason: string | null
      totalTokens: number
    }> => {
      const toolCallMap: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}
      let finishReason: string | null = null
      let totalTokens = 0
      const decoder = new TextDecoder()
      let sseBuffer = ''
      const reader = res.body?.getReader()
      if (!reader) return { toolCalls: [], finishReason: null, totalTokens: 0 }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
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
                const fr = parsed.choices?.[0]?.finish_reason
                if (fr) finishReason = fr
                // 捕获 token 用量（Kimi 在最后一个有效 chunk 里带 usage）
                if (parsed.usage?.total_tokens) {
                  totalTokens = parsed.usage.total_tokens
                }

                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content
                  await sendEvent({ type: 'reasoning', content: delta.reasoning_content })
                }
                if (delta?.content) {
                  fullContent += delta.content
                  await sendEvent({ type: 'content', content: delta.content })
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx: number = tc.index
                    if (!toolCallMap[idx]) {
                      toolCallMap[idx] = {
                        id: tc.id ?? '',
                        type: tc.type ?? 'function',
                        function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' }
                      }
                    } else {
                      if (tc.function?.name) toolCallMap[idx].function.name += tc.function.name
                      if (tc.function?.arguments) toolCallMap[idx].function.arguments += tc.function.arguments
                    }
                  }
                }
              } catch {
                // ignore JSON parse errors in stream
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
      return { toolCalls: Object.values(toolCallMap), finishReason, totalTokens }
    }

    try {
      // 首轮：带 tools 声明，失败时降级去掉 tools 重试
      let response: Response
      try {
        response = await fetchCompletionStream(requestBody)
      } catch (error) {
        if (!requestBody.tools) throw error
        const fallbackBody = { ...requestBody }
        delete fallbackBody.tools
        response = await fetchCompletionStream(fallbackBody)
      }

      if (!response.ok) {
        const errorText = await response.text()
        await sendEvent({ type: 'error', message: `API error ${response.status}: ${errorText}` })
        return
      }

      // 多轮 while 循环：最多 5 轮，防止无限搜索
      const MAX_SEARCH_ROUNDS = 5
      let currentMessages = [...fullMessages]
      let currentResponse = response
      let round = 1
      let totalTokensUsed = 0

      while (round <= MAX_SEARCH_ROUNDS) {
        const { toolCalls, finishReason, totalTokens } = await readRound(currentResponse)
        if (totalTokens > 0) totalTokensUsed += totalTokens

        // 非 tool_calls 结束，或没有任何 tool call → 正常退出
        if (finishReason !== 'tool_calls' || toolCalls.length === 0) break

        // 构造本轮的 assistant 消息和 tool result 消息
        const assistantMsg: AIMessage = {
          role: 'assistant',
          content: fullContent || '',
          tool_calls: toolCalls,
          reasoning_content: reasoningContent || undefined
        }
        const toolMessages: AIMessage[] = toolCalls.map((tc) => ({
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: tc.function.arguments  // $web_search 内置搜索：回传 arguments，由 Moonshot 服务端执行
        }))

        currentMessages = [...currentMessages, assistantMsg, ...toolMessages]
        round += 1

        if (round > MAX_SEARCH_ROUNDS) break

        // 通知前端：即将进行第 N 轮搜索
        await sendEvent({
          type: 'search_round',
          round,
          message: round === 2
            ? '你的问题有点复杂，正在进行更多搜索…'
            : `正在进行第 ${round} 轮搜索，请稍候…`
        })

        // 续轮请求：必须带上 tools 声明，否则模型无法继续调用搜索
        const nextBody: Record<string, unknown> = {
          model,
          messages: currentMessages,
          max_tokens: AI_CONFIG.MAX_TOKENS,
          temperature: AI_CONFIG.TEMPERATURE,
          stream: true,
          tools: [{ type: 'builtin_function', function: { name: '$web_search' } }]
        }

        const nextRes = await fetchCompletionStream(nextBody)
        if (!nextRes.ok) {
          // 续轮失败：直接结束，已有内容仍然返回给用户
          break
        }
        currentResponse = nextRes
      }

      await sendEvent({ type: 'done', fullText: fullContent })

      // 共享 key 模式：累加本轮消耗的 token 数
      if (usingSharedKey && totalTokensUsed > 0) {
        addDailyTokens(db, totalTokensUsed)
      }

      // B2: 每次实质性对话结束后尝试触发心智模型更新
      if (!isOnboarding && fullContent.length > 80) {
        try {
          const pendingMM = db.prepare(
            "SELECT id FROM agent_tasks WHERE type='extract_mental_model' AND status IN ('pending','running') LIMIT 1"
          ).get()
          if (!pendingMM) {
            const mmRow = db.prepare(
              'SELECT updated_at FROM user_mental_model WHERE id=1'
            ).get() as { updated_at: string } | undefined
            const lastUpdateMs = mmRow ? new Date(mmRow.updated_at).getTime() : 0
            const lastUpdate = isNaN(lastUpdateMs) ? 0 : lastUpdateMs
            if (Date.now() - lastUpdate > 10 * 60 * 1000) { // 10 分钟冷却
              enqueueTask(db, 'extract_mental_model', {})
              console.log('[ai/stream] enqueued extract_mental_model')
            }
          }
        } catch { /* 静默失败 */ }
      }
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
  const rawBody = await c.req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 1 * 1024 * 1024) {
    return c.json({ title: null }, 413)
  }
  const { userMessage, assistantMessage } = JSON.parse(rawBody) as {
    userMessage: string
    assistantMessage: string
  }

  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = row?.value ?? (process.env.SHARED_API_KEY ?? process.env.ONBOARDING_API_KEY ?? '')
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
