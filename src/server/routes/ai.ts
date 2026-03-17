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
 *   data: {"type":"url_fetch","url":"...","status":"fetching"|"done"|"failed"}
 *   data: {"type":"usage","totalTokens":123,"model":"..."}
 *   data: {"type":"search_round","round":2,"message":"正在检索文件内容…"}
 *
 * Memory strategy env vars (v0.4.3+):
 *   MEMORY_STRATEGY=baseline|scored  (default: baseline)
 *   MEMORY_DECAY=false|true          (default: false, 指数时间衰减 half-life ~69 days)
 *   MEMORY_BUDGET=<number>           (default: 1500, system prompt 注入层总 token 预算)
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
import { cosineSim, embedTextWithUserKey } from '../lib/embedding'

export const aiRoutes = new Hono()

/** Get the per-user database from request context */
function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

// ── Token 预算工具 ───────────────────────────────────────────────────────────
const CONTEXT_BUDGET = parseInt(process.env.MEMORY_BUDGET ?? '1500', 10) || 1500  // system prompt 注入层总 token 预算
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

export function appendClientContextBlocks(
  systemPrompt: string,
  {
    compressedMemory,
    extraContext,
    contextTokensUsed = 0,
  }: {
    compressedMemory?: string
    extraContext?: string
    contextTokensUsed?: number
  }
): { systemPrompt: string; contextTokensUsed: number } {
  let nextPrompt = systemPrompt
  let nextTokensUsed = contextTokensUsed

  if (compressedMemory?.trim()) {
    const block = '\n\n【相关记忆片段 - 供参考】\n' + compressedMemory.trim()
    const cost = approxTokens(block)
    if (nextTokensUsed + cost <= CONTEXT_BUDGET) {
      nextPrompt += block
      nextTokensUsed += cost
    }
  }

  if (extraContext?.trim()) {
    nextPrompt += `\n\n【额外上下文】\n${extraContext.trim()}`
  }

  return { systemPrompt: nextPrompt, contextTokensUsed: nextTokensUsed }
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
    const queryF32 = await embedTextWithUserKey(query, apiKey, baseUrl, { maxInputLen: 500, timeoutMs: 5_000 })
    if (!queryF32) return bm25FallbackFacts(db, query)

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
  } catch { /* embedding 失败时降级到 BM25 关键词匹配 */
    return bm25FallbackFacts(db, query)
  }
}

// ── 记忆评分系统（v0.4.3+）────────────────────────────────────────────────────
// memory_scores.json 格式（存在 storage 表，字段 filename='memory_scores.json'）：
// { "fact_id": { "importance": 0.9, "emotion": "positive", "access_count": 5, "last_accessed_at": "ISO" } }

interface MemoryScore {
  importance: number        // 0~1，AI 提取时打分（暂时由 scored 策略自动推断）
  emotion: 'positive' | 'negative' | 'neutral' | 'mixed'
  access_count: number
  last_accessed_at: string  // ISO timestamp
}

function loadMemoryScores(db: InstanceType<typeof Database>): Map<string, MemoryScore> {
  try {
    const row = db.prepare("SELECT content FROM storage WHERE filename = 'memory_scores.json'").get() as { content: string } | undefined
    if (!row?.content) return new Map()
    const raw = JSON.parse(row.content) as Record<string, MemoryScore>
    return new Map(Object.entries(raw))
  } catch { return new Map() }
}

function saveMemoryScores(db: InstanceType<typeof Database>, scores: Map<string, MemoryScore>): void {
  try {
    const content = JSON.stringify(Object.fromEntries(scores))
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO storage (filename, content, updated_at) VALUES ('memory_scores.json', ?, ?)
      ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(content, now)
  } catch { /* 评分写入失败不阻塞主流程 */ }
}

// MEMORY_DECAY=true 时使用指数时间衰减因子（半衰期 ~69 天）
const MEMORY_DECAY_ENABLED = (process.env.MEMORY_DECAY ?? 'false') === 'true'
const DECAY_HALF_LIFE_DAYS = 69

function applyDecay(cosineScore: number, factCreatedAt: string): number {
  if (!MEMORY_DECAY_ENABLED) return cosineScore
  const daysSince = (Date.now() - new Date(factCreatedAt).getTime()) / 86_400_000
  const decayFactor = Math.exp(-Math.LN2 / DECAY_HALF_LIFE_DAYS * daysSince)
  return cosineScore * decayFactor
}

// scored 策略：与 baseline 相同的语义检索，额外叠加 importance + 时间衰减
async function fetchScoredFacts(
  db: InstanceType<typeof Database>,
  query: string,
  apiKey: string,
  baseUrl: string
): Promise<string[]> {
  if (!query.trim() || !apiKey) return []
  try {
    const queryF32 = await embedTextWithUserKey(query, apiKey, baseUrl, { maxInputLen: 500, timeoutMs: 5_000 })
    if (!queryF32) return bm25FallbackFacts(db, query)

    const facts = db.prepare(
      'SELECT id, fact, source_conv_id, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 100'
    ).all() as { id: string; fact: string; source_conv_id: string | null; created_at: string }[]
    if (facts.length === 0) return []

    const embRows = db.prepare(
      'SELECT conversation_id, vector FROM embeddings ORDER BY updated_at DESC LIMIT 500'
    ).all() as { conversation_id: string; vector: Buffer }[]
    const embMap = new Map(embRows.map(r => [r.conversation_id, r.vector]))

    const scores = loadMemoryScores(db)

    const now = new Date().toISOString()
    const selectedIds: string[] = []

    const ranked = facts
      .map(f => {
        const vecBuf = f.source_conv_id ? embMap.get(f.source_conv_id) : undefined
        let cosine = 0
        if (vecBuf) {
          const vec = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.byteLength / 4)
          cosine = cosineSim(queryF32, vec)
        }
        const decayed = applyDecay(cosine, f.created_at)
        const meta = scores.get(f.id)
        const importance = meta?.importance ?? 0.5  // 新 fact 默认 0.5
        const accessBonus = Math.min(0.15, (meta?.access_count ?? 0) * 0.02)
        const finalScore = decayed * (0.7 + importance * 0.3) + accessBonus
        return { id: f.id, fact: f.fact, finalScore }
      })
      .filter(r => r.finalScore > 0.15)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 10)

    // 更新 access_count + last_accessed_at
    for (const r of ranked) {
      const meta = scores.get(r.id) ?? { importance: 0.5, emotion: 'neutral' as const, access_count: 0, last_accessed_at: now }
      scores.set(r.id, { ...meta, access_count: meta.access_count + 1, last_accessed_at: now })
      selectedIds.push(r.id)
    }
    if (selectedIds.length > 0) {
      // 异步写回评分（不阻塞当前请求）
      setImmediate(() => saveMemoryScores(db, scores))
    }

    return ranked.map(r => r.fact)
  } catch {
    return bm25FallbackFacts(db, query)
  }
}

// ── 会话级记忆摘要（v0.4.4+）─────────────────────────────────────────────────
// session_memory.json 格式（存在 storage 表，key='session_memory.json'）：
// { "conv_id": { "summary": "...", "turn_count": 15, "updated_at": "ISO" } }

interface SessionMemoryEntry {
  summary: string
  turn_count: number
  updated_at: string
}

function loadSessionMemory(
  db: InstanceType<typeof Database>,
  convId: string
): SessionMemoryEntry | null {
  try {
    const row = db.prepare("SELECT content FROM storage WHERE filename = 'session_memory.json'").get() as { content: string } | undefined
    if (!row?.content) return null
    const raw = JSON.parse(row.content) as Record<string, SessionMemoryEntry>
    return raw[convId] ?? null
  } catch { return null }
}

function saveSessionMemory(
  db: InstanceType<typeof Database>,
  convId: string,
  entry: SessionMemoryEntry
): void {
  try {
    const existing = db.prepare("SELECT content FROM storage WHERE filename = 'session_memory.json'").get() as { content: string } | undefined
    const all: Record<string, SessionMemoryEntry> = existing?.content ? JSON.parse(existing.content) : {}
    all[convId] = entry
    // 只保留最近 50 条会话摘要，防止无限增长
    const keys = Object.keys(all)
    if (keys.length > 50) {
      keys.sort((a, b) => (all[a].updated_at < all[b].updated_at ? -1 : 1))
      keys.slice(0, keys.length - 50).forEach(k => delete all[k])
    }
    const content = JSON.stringify(all)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO storage (filename, content, updated_at) VALUES ('session_memory.json', ?, ?)
      ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(content, now)
  } catch { /* 写入失败不阻塞主流程 */ }
}

async function generateSessionSummary(
  db: InstanceType<typeof Database>,
  convId: string,
  messages: AIMessage[],
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<void> {
  try {
    // 取最近 20 条消息做摘要（避免过长）
    const recent = messages.slice(-20)
    const dialogue = recent
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        const content = typeof m.content === 'string'
          ? m.content
          : (m.content as any[]).find(c => c.type === 'text')?.text ?? ''
        return `${m.role === 'user' ? '用户' : 'AI'}：${content.slice(0, 300)}`
      })
      .join('\n')

    const summaryResp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个对话摘要助手。请用 2-3 句话总结以下对话的核心内容、关键决定和结论。输出纯文本，不要 markdown。' },
          { role: 'user', content: `请总结以下对话：\n\n${dialogue}` }
        ],
        max_tokens: 200,
        stream: false
      }),
      signal: AbortSignal.timeout(15_000)
    })
    if (!summaryResp.ok) return
    const summaryData = (await summaryResp.json()) as { choices: { message: { content: string } }[] }
    const summary = summaryData?.choices?.[0]?.message?.content?.trim()
    if (!summary) return

    saveSessionMemory(db, convId, {
      summary,
      turn_count: messages.filter(m => m.role === 'user').length,
      updated_at: new Date().toISOString()
    })
    console.log(`[ai/stream] session summary generated for conv ${convId.slice(0, 8)}…`)
  } catch { /* 生成失败不影响主流程 */ }
}

// ── 记忆意图检测：判断问题需要哪类记忆 ─────────────────────────────────────────
type MemoryIntent = 'episodic' | 'procedural' | 'profile' | 'semantic'

function detectMemoryIntent(query: string): MemoryIntent {
  const q = query.toLowerCase()
  // episodic：询问"我之前说过什么"、"上次"、"我记得"等历史经历
  if (/我之前|我以前|我上次|我曾经|之前说过|以前提到|我记得我|我好像说|上次聊|我有没有说/.test(q)) {
    return 'episodic'
  }
  // procedural：询问回答方式、让 AI 记住某种偏好
  if (/你以后|你下次|记住.*回答|以后.*别|以后.*要|以后.*用|记住我|你需要知道.*我|你要.*方式/.test(q)) {
    return 'procedural'
  }
  // profile：询问"我是谁"、"我的XX是什么"
  if (/我是什么人|我的职业|我的目标|我的兴趣|我的背景|你了解我|我的信息|你知道我/.test(q)) {
    return 'profile'
  }
  return 'semantic'
}

/** 按记忆类型过滤（type 字段），episodic/procedural 直接走类型精确查询 */
function fetchFactsByType(
  db: InstanceType<typeof Database>,
  type: 'episodic' | 'procedural',
  limit = 8
): string[] {
  try {
    return (db.prepare(
      'SELECT fact FROM memory_facts WHERE invalid_at IS NULL AND type = ? ORDER BY created_at DESC LIMIT ?'
    ).all(type, limit) as { fact: string }[]).map(r => r.fact)
  } catch { return [] }
}

/** 从 user_profile 组装画像文本片段 */
function fetchProfileSummary(db: InstanceType<typeof Database>): string[] {
  try {
    const profile = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined
    if (!profile) return []
    const parts: string[] = []
    if (profile.occupation) parts.push(`职业：${profile.occupation}`)
    if (profile.location) parts.push(`所在地：${profile.location}`)
    try { if (profile.goals) { const arr = JSON.parse(profile.goals) as string[]; if (arr.length) parts.push(`当前关注：${arr.join('、')}`) } } catch {}
    try { if (profile.interests) { const arr = JSON.parse(profile.interests) as string[]; if (arr.length) parts.push(`兴趣：${arr.join('、')}`) } } catch {}
    try { if (profile.tools) { const arr = JSON.parse(profile.tools) as string[]; if (arr.length) parts.push(`常用工具：${arr.join('、')}`) } } catch {}
    return parts
  } catch { return [] }
}

const MEMORY_STRATEGY = process.env.MEMORY_STRATEGY ?? 'baseline'  // baseline | scored

interface AIRequestBody {
  messages: AIMessage[]
  preferences?: string[]
  compressedMemory?: string
  extraContext?: string
  isOnboarding?: boolean
  conversationId?: string
  searchMode?: 'forced' | 'hybrid' | 'agent'
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
  } catch { /* DB 读取失败时允许通过，避免 budget 检查阻断正常对话 */
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

// ── URL 内容预取（Jina Reader）────────────────────────────────────────────────
async function fetchUrlContent(url: string): Promise<string | null> {
  // 只允许 http/https URL，防止 SSRF（file://、ftp:// 等）
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const resp = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown' },
      signal: AbortSignal.timeout(8_000)
    })
    if (!resp.ok) return null
    const text = await resp.text()
    return text.slice(0, 8000) // max 8000 chars ≈ 2000 tokens
  } catch { return null }
}

async function runWebSearch(query: string): Promise<string | null> {
  const cleaned = query.trim().slice(0, 200)
  if (!cleaned) return null
  try {
    const resp = await fetch(`https://s.jina.ai/${encodeURIComponent(cleaned)}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(8_000)
    })
    if (!resp.ok) return null
    const text = await resp.text()
    return text.slice(0, 4000)
  } catch {
    return null
  }
}

// Note: use .match() only — never .exec() loop (shared lastIndex on /g regex)
const URL_REGEX = /https?:\/\/[^\s\]）)>】'"。，！？；：\s]{10,}/g

// ── 文件语义检索（直接访问 DB + embedding，不走 HTTP 环回）────────────────────
async function searchFileChunks(
  db: InstanceType<typeof Database>,
  query: string,
  apiKey: string,
  baseUrl: string
): Promise<Array<{ filename: string; chunkIndex: number; chunkText: string; score: number }>> {
  try {
    const queryF32 = await embedTextWithUserKey(query, apiKey, baseUrl, { maxInputLen: 1000, timeoutMs: 8_000 })
    if (!queryF32) return []

    const rows = db.prepare(`
      SELECT fe.chunk_index, fe.chunk_text, fe.vector, uf.filename
      FROM file_embeddings fe
      JOIN uploaded_files uf ON uf.id = fe.file_id
      WHERE uf.embed_status = 'done'
      ORDER BY fe.created_at DESC LIMIT 500
    `).all() as { chunk_index: number; chunk_text: string; vector: Buffer; filename: string }[]

    return rows
      .map(row => {
        // 复制 Buffer 到独立的 ArrayBuffer，避免共享 slab 的字节对齐问题
        const copied = row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)
        const vec = new Float32Array(copied)
        const score = cosineSim(queryF32, vec)
        return { filename: row.filename, chunkIndex: row.chunk_index, chunkText: row.chunk_text, score }
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  } catch { return [] }
}

// ── 工具定义：$web_search（内置）+ search_memory（本地）──────────────────────
const TOOLS_WITH_MEMORY = [
  { type: 'builtin_function', function: { name: '$web_search' } },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: '查询用户的个人记忆库，用于回答"我之前说过什么关于X"、"我的Y是什么"等需要检索个人历史的问题',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在用户上传的文件中语义搜索相关内容片段，用于回答"文件里说的X是什么"、"帮我找文件中关于Y的部分"等问题',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要搜索的内容关键词或问题' }
        },
        required: ['query']
      }
    }
  }
]

// POST /stream body 上限：20MB（含图片 base64，单张图片约 5~8MB）
const MAX_STREAM_BODY = 20 * 1024 * 1024

aiRoutes.post('/stream', async (c) => {
  const db = userDb(c)
  const rawBody = await c.req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_STREAM_BODY) {
    return c.json({ error: '请求体过大，最大支持 20MB（单次请求图片数量过多或消息过长）' }, 413)
  }
  let body: AIRequestBody
  try {
    body = JSON.parse(rawBody) as AIRequestBody
  } catch {
    return c.json({ error: '请求体格式错误' }, 400)
  }
  const { messages, preferences = [], compressedMemory, isOnboarding = false, conversationId } = body
  const systemPromptOverride = typeof body.systemPromptOverride === 'string'
    ? body.systemPromptOverride.slice(0, 8000)
    : undefined
  const extraContext = typeof body.extraContext === 'string'
    ? body.extraContext.slice(0, 12000)
    : undefined
  const allowedSearchModes = new Set(['forced', 'hybrid', 'agent'])
  const requestedMode = typeof body.searchMode === 'string' ? body.searchMode : undefined
  let searchMode: 'forced' | 'hybrid' | 'agent' = 'hybrid'
  if (requestedMode && allowedSearchModes.has(requestedMode)) {
    searchMode = requestedMode as 'forced' | 'hybrid' | 'agent'
  } else {
    const modeRow = db.prepare('SELECT value FROM config WHERE key = ?').get('search_mode') as { value: string } | undefined
    if (modeRow?.value && allowedSearchModes.has(modeRow.value)) {
      searchMode = modeRow.value as 'forced' | 'hybrid' | 'agent'
    }
  }

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
  let contextTokensUsed = 0
  if (systemPromptOverride) {
    systemPrompt = systemPromptOverride.replace('{{DATE}}', today)
  } else if (isOnboarding) {
    systemPrompt = ONBOARDING_SYSTEM_PROMPT.replace('{{DATE}}', today)
  } else {
    systemPrompt = DEFAULT_SYSTEM_PROMPT.replace('{{DATE}}', today)

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

    // ── 层 3：记忆事实（按意图路由 → 语义检索 > BM25 > 最近 N 条降级）──
    if (searchMode !== 'agent') {
      try {
        let relevantFacts: string[] = []
        if (trimmedText.length > 5) {
          const memIntent = detectMemoryIntent(trimmedText)

          if (memIntent === 'episodic') {
            // 询问历史经历：优先返回带时间线的 episodic 类型，fallback 到全类型语义检索
            const episodicFacts = fetchFactsByType(db, 'episodic', 8)
            relevantFacts = episodicFacts.length > 0
              ? episodicFacts
              : await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
          } else if (memIntent === 'procedural') {
            // 询问偏好规则：直接返回 procedural 类型，已经在层 1 注入过，这里追加 semantic 作补充
            const proceduralFacts = fetchFactsByType(db, 'procedural', 5)
            const semanticFacts = MEMORY_STRATEGY === 'scored'
              ? await fetchScoredFacts(db, trimmedText, effectiveApiKey, baseUrl)
              : await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
            relevantFacts = [...proceduralFacts, ...semanticFacts].slice(0, 10)
          } else if (memIntent === 'profile') {
            // 询问个人信息：优先 profile 摘要，再补 semantic facts
            const profileParts = fetchProfileSummary(db)
            const semanticFacts = await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
            // profile 已在层 2 注入，这里补充 semantic facts 即可
            relevantFacts = semanticFacts
            if (profileParts.length > 0 && relevantFacts.length === 0) {
              relevantFacts = profileParts
            }
          } else {
            // semantic（默认）：原有逻辑不变
            relevantFacts = MEMORY_STRATEGY === 'scored'
              ? await fetchScoredFacts(db, trimmedText, effectiveApiKey, baseUrl)
              : await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
          }
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
    }

    if (searchMode !== 'forced') {
      systemPrompt += '\n\n【检索决策规则】\n- 先根据上下文判断信息缺口，再决定是否调用工具\n- 可用工具：search_memory（用户记忆）、search_files（上传文件）、$web_search（外部网页）\n- 优先少量高质量检索，不要无意义多轮搜索\n- 如果问题可直接回答，不必强行检索'
    }

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

    // ── 层 3.5（会话级摘要，CONTEXT_BUDGET 之外，长对话关键信息保留）──
    if (conversationId && !isOnboarding) {
      try {
        const sessionEntry = loadSessionMemory(db, conversationId)
        if (sessionEntry?.summary && messages.length >= 10) {
          systemPrompt += `\n\n【本次对话摘要（第 ${sessionEntry.turn_count} 轮前）】\n${sessionEntry.summary}`
        }
      } catch { /* 静默失败 */ }
    }

    // ── 层 4（最低优先级）：前端传入的压缩记忆片段 ──
  }

  ;({ systemPrompt, contextTokensUsed } = appendClientContextBlocks(systemPrompt, {
    compressedMemory,
    extraContext,
    contextTokensUsed,
  }))

  return streamSSE(c, async (stream) => {
    let fullContent = ''
    let reasoningContent = ''
    // 若触发了多轮检索但本轮流式最终没有任何正文输出，则自动转入后台深度搜索，
    // 避免用户看到“搜索中…但一片空白”的体验。
    let sawSearchRound = false
    let handedOffToDeepSearch = false
    let deepSearchTaskId: number | null = null

    const sendEvent = async (data: Record<string, unknown>) => {
      await stream.writeSSE({ data: JSON.stringify(data) })
    }

    // ── URL 内容预取（带进度 SSE 反馈）─────────────────────────────────────
    const urlContents: string[] = []
    if (!isSimpleQuery) {
      const urls = trimmedText.match(URL_REGEX) ?? []
      for (const url of urls.slice(0, 2)) {
        await sendEvent({ type: 'url_fetch', url, status: 'fetching' })
        const content = await fetchUrlContent(url)
        if (content) {
          urlContents.push(`## 网页内容 [${url}]\n\n${content}`)
          await sendEvent({ type: 'url_fetch', url, status: 'done' })
        } else {
          await sendEvent({ type: 'url_fetch', url, status: 'failed' })
        }
      }
    }

    // ── fullMessages + requestBody（依赖 urlContents）────────────────────────
    const fullMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(urlContents.length > 0
        ? [{ role: 'system' as const, content: '\n\n【用户分享的网页内容】\n' + urlContents.join('\n\n---\n\n') }]
        : []),
      ...messages
    ]
    const requestBody: Record<string, unknown> = {
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature: AI_CONFIG.TEMPERATURE,
      stream: true
    }
    // 工具调用（search_memory + search_files + $web_search）：所有 Moonshot 模型和已知多模态模型均支持
    // MULTIMODAL_MODELS 仅控制图片能力，工具调用不受此限制
    const supportsTools = searchMode !== 'forced' && !isSimpleQuery && (
      MULTIMODAL_MODELS.includes(model as typeof MULTIMODAL_MODELS[number]) ||
      baseUrl.includes('moonshot') ||
      model.startsWith('moonshot-')
    )
    if (supportsTools) {
      requestBody.tools = TOOLS_WITH_MEMORY
    }

    const fetchCompletionStreamWithTimeout = async (body: Record<string, unknown>, timeoutMs: number) => {
      const ac = new AbortController()
      const onAbort = () => ac.abort()
      try {
        c.req.raw.signal.addEventListener('abort', onAbort)
        const timer = setTimeout(() => ac.abort(), timeoutMs)
        try {
          return await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${effectiveApiKey}`
            },
            body: JSON.stringify(body),
            signal: ac.signal
          })
        } finally {
          clearTimeout(timer)
        }
      } finally {
        c.req.raw.signal.removeEventListener('abort', onAbort)
      }
    }

    const fetchCompletionStream = async (body: Record<string, unknown>) => {
      // 深度搜索可能较久：单次上游请求给更宽裕的超时（避免 60s 假死）
      return fetchCompletionStreamWithTimeout(body, 8 * 60_000)
    }

    /**
     * 读取单轮流式响应，返回本轮累积的 tool_calls（如果有）和 finish_reason。
     * content / reasoning 增量会直接通过 sendEvent 推送给前端。
     */
    const readRound = async (res: Response): Promise<{
      toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      finishReason: string | null
      totalTokens: number
      roundContent: string
      roundReasoning: string
    }> => {
      const toolCallMap: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}
      let finishReason: string | null = null
      let totalTokens = 0
      let roundContent = ''
      let roundReasoning = ''
      const decoder = new TextDecoder()
      let sseBuffer = ''
      const reader = res.body?.getReader()
      if (!reader) return { toolCalls: [], finishReason: null, totalTokens: 0, roundContent: '', roundReasoning: '' }

      const upsertToolCall = (tc: any, fallbackIndex: number) => {
        const idx = Number.isInteger(tc?.index) ? Number(tc.index) : fallbackIndex
        if (!toolCallMap[idx]) {
          toolCallMap[idx] = {
            id: tc?.id ?? '',
            type: tc?.type ?? 'function',
            function: {
              name: tc?.function?.name ?? '',
              arguments: tc?.function?.arguments ?? ''
            }
          }
        } else {
          if (tc?.id) toolCallMap[idx].id = tc.id
          if (tc?.type) toolCallMap[idx].type = tc.type
          if (tc?.function?.name) toolCallMap[idx].function.name += tc.function.name
          if (tc?.function?.arguments) toolCallMap[idx].function.arguments += tc.function.arguments
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
          const parts = sseBuffer.split(/\r?\n\r?\n/)
          sseBuffer = parts.pop() ?? ''

          for (const part of parts) {
            for (const line of part.split(/\r?\n/)) {
              const l = line.trimEnd()
              if (!l.startsWith('data:')) continue
              let data = l.slice(5)
              if (data.startsWith(' ')) data = data.slice(1)
              data = data.trimStart()
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
                  roundReasoning += delta.reasoning_content
                  await sendEvent({ type: 'reasoning', content: delta.reasoning_content })
                }
                if (delta?.content) {
                  roundContent += delta.content
                  await sendEvent({ type: 'content', content: delta.content })
                }
                if (delta?.tool_calls) {
                  delta.tool_calls.forEach((tc: any, i: number) => upsertToolCall(tc, i))
                }
                const msgToolCalls = parsed.choices?.[0]?.message?.tool_calls
                if (Array.isArray(msgToolCalls) && msgToolCalls.length > 0) {
                  msgToolCalls.forEach((tc: any, i: number) => upsertToolCall(tc, i))
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
      return { toolCalls: Object.values(toolCallMap), finishReason, totalTokens, roundContent, roundReasoning }
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
        const { toolCalls, finishReason, totalTokens, roundContent, roundReasoning } = await readRound(currentResponse)
        if (roundContent) fullContent += roundContent
        if (roundReasoning) reasoningContent += roundReasoning
        if (totalTokens > 0) totalTokensUsed += totalTokens

        // 非 tool_calls 结束，或没有任何 tool call → 正常退出
        if (finishReason !== 'tool_calls' || toolCalls.length === 0) break
        // tool call id 缺失时不能继续拼装 tool_result，直接降级结束本轮，避免 400
        if (toolCalls.some(tc => !tc.id)) break

        // 构造本轮的 assistant 消息和 tool result 消息
        const assistantMsg: AIMessage = {
          role: 'assistant',
          content: roundContent || '',
          tool_calls: toolCalls,
          reasoning_content: roundReasoning || undefined
        }
        const toolMessages: AIMessage[] = await Promise.all(toolCalls.map(async (tc) => {
          if (tc.function.name === 'search_memory') {
            // 本地执行：查询记忆库
            let result = '未找到相关记忆。'
            try {
              const args = JSON.parse(tc.function.arguments || '{}') as { query?: string }
              const query = args.query?.trim() ?? ''
              if (query) {
                const facts = await fetchRelevantFacts(db, query, effectiveApiKey, baseUrl)
                if (facts.length > 0) {
                  result = facts.map((f, i) => `${i + 1}. ${f}`).join('\n')
                }
              }
            } catch { /* 静默 */ }
            return { role: 'tool' as const, tool_call_id: tc.id, content: result }
          }
          if (tc.function.name === 'search_files') {
            let result = '未找到相关文件内容。'
            try {
              const args = JSON.parse(tc.function.arguments || '{}') as { query?: string }
              const query = args.query?.trim() ?? ''
              if (query) {
                const chunks = await searchFileChunks(db, query, effectiveApiKey, baseUrl)
                if (chunks.length > 0) {
                  result = chunks
                    .map((c, i) => `[${i + 1}] 文件《${c.filename}》第${c.chunkIndex + 1}段：\n${c.chunkText}`)
                    .join('\n\n')
                }
              }
            } catch { /* 静默 */ }
            return { role: 'tool' as const, tool_call_id: tc.id, content: result }
          }
          // $web_search：回传 arguments，由 Moonshot 服务端执行
          let result = '网页搜索暂时无结果。'
          try {
            const args = JSON.parse(tc.function.arguments || '{}') as Record<string, string | undefined>
            const query = (
              args.query ??
              args.q ??
              args.keyword ??
              args.keywords ??
              ''
            ).trim()
            if (query) {
              const fetched = await runWebSearch(query)
              if (fetched) result = fetched
            }
          } catch { /* 静默 */ }
          return { role: 'tool' as const, tool_call_id: tc.id, content: result }
        }))

        currentMessages = [...currentMessages, assistantMsg, ...toolMessages]
        round += 1

        if (round > MAX_SEARCH_ROUNDS) break

        // 通知前端：即将进行第 N 轮搜索（区分 web 搜索 vs 记忆查询 vs 文件检索）
        const isMemoryRound = toolCalls.some(tc => tc.function.name === 'search_memory')
        const isFileRound = toolCalls.some(tc => tc.function.name === 'search_files')
        await sendEvent({
          type: 'search_round',
          round,
          message: isMemoryRound
            ? '正在查询记忆库…'
            : isFileRound
              ? '正在检索文件内容…'
              : (round === 2 ? '你的问题有点复杂，正在进行更多搜索…' : `正在进行第 ${round} 轮搜索，请稍候…`)
        })
        sawSearchRound = true

        // 续轮请求：必须带上 tools 声明，否则模型无法继续调用搜索
        const nextBody: Record<string, unknown> = {
          model,
          messages: currentMessages,
          max_tokens: AI_CONFIG.MAX_TOKENS,
          temperature: AI_CONFIG.TEMPERATURE,
          stream: true,
          tools: TOOLS_WITH_MEMORY
        }

        try {
          const nextRes = await fetchCompletionStreamWithTimeout(nextBody, 8 * 60_000)
          if (!nextRes.ok) {
            // 续轮失败：直接结束，已有内容仍然返回给用户
            break
          }
          currentResponse = nextRes
        } catch (e) {
          // 工具检索轮常见风险：上游卡住/超时。此时不“强行直接回答”，而是转入后台深度搜索继续跑，
          // 前端展示进行中状态；用户可关闭窗口，稍后回来看结果。
          let taskId: number | null = null
          try {
            if (conversationId) {
              // 避免重复入队：若已有未完成的 deep_search，则复用
              const existing = db.prepare(
                "SELECT id FROM agent_tasks WHERE type='deep_search' AND ref_id=? AND status IN ('pending','running') ORDER BY id DESC LIMIT 1"
              ).get(conversationId) as { id: number } | undefined
              taskId = existing?.id ?? enqueueTask(db, 'deep_search', {
                conversationId,
                messages,
                preferences,
                compressedMemory,
                isOnboarding,
                systemPromptOverride,
              }, conversationId)
            }
          } catch { /* ignore */ }
          await sendEvent({
            type: 'deep_search',
            status: 'running',
            taskId,
            message: '深度搜索已转入后台继续运行（可关闭窗口，完成后会更新到该节点）。'
          })
          handedOffToDeepSearch = true
          deepSearchTaskId = taskId
          break
        }
      }

      // 自动兜底：如果“多轮检索已触发”但最终内容为空，直接转入后台深度搜索继续跑
      if (!handedOffToDeepSearch && sawSearchRound && !fullContent.trim() && conversationId) {
        try {
          const existing = db.prepare(
            "SELECT id FROM agent_tasks WHERE type='deep_search' AND ref_id=? AND status IN ('pending','running') ORDER BY id DESC LIMIT 1"
          ).get(conversationId) as { id: number } | undefined
          deepSearchTaskId = existing?.id ?? enqueueTask(db, 'deep_search', {
            conversationId,
            messages,
            preferences,
            compressedMemory,
            isOnboarding,
            systemPromptOverride,
          }, conversationId)
          handedOffToDeepSearch = true
        } catch { /* ignore */ }
        if (handedOffToDeepSearch) {
          await sendEvent({
            type: 'deep_search',
            status: 'running',
            taskId: deepSearchTaskId,
            message: '深度搜索正在后台继续运行（本次流式输出为空，稍后会自动回写到该节点）。'
          })
        }
      }

      await sendEvent({ type: 'done', fullText: fullContent })

      // Token 用量反馈（参考 ChatGPT token 显示，供前端展示消耗）
      if (totalTokensUsed > 0) {
        await sendEvent({ type: 'usage', totalTokens: totalTokensUsed, model })
      }

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

      // 会话摘要：轮数 >= 10 且尚无摘要时，异步生成（不阻塞响应）
      if (!isOnboarding && conversationId && messages.filter(m => m.role === 'user').length >= 10) {
        const existing = loadSessionMemory(db, conversationId)
        if (!existing) {
          setImmediate(() =>
            generateSessionSummary(db, conversationId, messages, effectiveApiKey, baseUrl, model)
          )
        }
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
 * POST /api/ai/deep-search
 * 启动一个“深度搜索”后台任务（可跨页面继续）。
 * Body: { conversationId, messages, preferences?, compressedMemory?, extraContext?, isOnboarding?, systemPromptOverride? }
 * Response: { ok: true, taskId }
 */
aiRoutes.post('/deep-search', async (c) => {
  const db = userDb(c)
  const rawBody = await c.req.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 2 * 1024 * 1024) {
    return c.json({ ok: false, error: 'payload too large' }, 413)
  }
  let body: Partial<AIRequestBody> & { conversationId?: string; messages?: unknown }
  try { body = JSON.parse(rawBody) } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const conversationId = (body.conversationId ?? '').trim()
  const messages = Array.isArray(body.messages) ? (body.messages as AIMessage[]) : []
  if (!conversationId || messages.length === 0) {
    return c.json({ ok: false, error: 'conversationId and messages required' }, 400)
  }

  // 若已有未完成的 deep_search，直接复用，避免重复跑
  try {
    const existing = db.prepare(
      "SELECT id, status FROM agent_tasks WHERE type='deep_search' AND ref_id=? AND status IN ('pending','running') ORDER BY id DESC LIMIT 1"
    ).get(conversationId) as { id: number; status: string } | undefined
    if (existing) {
      return c.json({ ok: true, taskId: existing.id, status: existing.status })
    }
  } catch { /* ignore */ }

  const taskId = enqueueTask(db, 'deep_search', {
    conversationId,
    messages,
    preferences: body.preferences ?? [],
    compressedMemory: body.compressedMemory ?? '',
    extraContext: body.extraContext ?? '',
    isOnboarding: body.isOnboarding ?? false,
    systemPromptOverride: body.systemPromptOverride ?? undefined,
  }, conversationId)

  // 把“深度搜索进行中”标记写回 conversations.jsonl（同 id 追加覆盖），供前端回放时识别并轮询
  try {
    const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as { content: string } | undefined
    const content = row?.content ?? ''
    let base: any = null
    if (content.trim()) {
      const lines = content.trim().split('\n').filter(Boolean)
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const conv = JSON.parse(lines[i]) as any
          if (conv?.id === conversationId) { base = conv; break }
        } catch { /* ignore */ }
      }
    }
    if (base) {
      const now = new Date().toISOString()
      const updated = {
        ...base,
        deepSearch: { taskId, status: 'pending', startedAt: now }
      }
      db.prepare(`
        INSERT INTO storage (filename, content, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(filename) DO UPDATE SET
          content = storage.content || CASE WHEN storage.content = '' THEN '' ELSE char(10) END || excluded.content,
          updated_at = excluded.updated_at
      `).run('conversations.jsonl', JSON.stringify(updated), now)
    }
  } catch { /* ignore */ }

  return c.json({ ok: true, taskId })
})

/**
 * GET /api/ai/deep-search/status/:conversationId
 * 返回某个对话的深度搜索后台任务状态与进度（若有结果会带上 result）。
 */
aiRoutes.get('/deep-search/status/:conversationId', (c) => {
  const db = userDb(c)
  const conversationId = (c.req.param('conversationId') ?? '').trim()
  if (!conversationId) return c.json({ ok: false, error: 'conversationId required' }, 400)
  try {
    const row = db.prepare(
      "SELECT id, status, progress, result, error, started_at, finished_at FROM agent_tasks WHERE type='deep_search' AND ref_id=? ORDER BY id DESC LIMIT 1"
    ).get(conversationId) as {
      id: number
      status: string
      progress: string | null
      result: string | null
      error: string | null
      started_at: string | null
      finished_at: string | null
    } | undefined
    if (!row) return c.json({ ok: true, exists: false })
    let parsedResult: unknown = null
    if (row.result) { try { parsedResult = JSON.parse(row.result) } catch { parsedResult = row.result } }
    return c.json({
      ok: true,
      exists: true,
      taskId: row.id,
      status: row.status,
      progress: row.progress,
      result: parsedResult,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })
  } catch (e) {
    return c.json({ ok: false, error: 'query failed' }, 500)
  }
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
    return c.json({ title: null })
  }
  let userMessage = ''
  let assistantMessage = ''
  try {
    const parsed = JSON.parse(rawBody) as {
      userMessage?: string
      assistantMessage?: string
    }
    userMessage = parsed.userMessage ?? ''
    assistantMessage = parsed.assistantMessage ?? ''
  } catch {
    return c.json({ title: null })
  }

  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const userApiKey = (row?.value ?? '').trim()
  const sharedApiKey = (process.env.SHARED_API_KEY ?? process.env.ONBOARDING_API_KEY ?? '').trim()
  const apiKey = userApiKey || sharedApiKey
  // 标题摘要属于非关键体验：无 key 时静默降级，不返回 4xx 干扰前端控制台
  if (!apiKey) return c.json({ title: null })

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
