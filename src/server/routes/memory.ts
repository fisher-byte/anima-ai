/**
 * Memory routes: embedding-based RAG + user profile + memory facts
 *
 * POST   /api/memory/index              索引一条对话 { conversationId, text }
 * DELETE /api/memory/index/:id          删除一条对话的索引
 * DELETE /api/memory/index              批量删除全部对话索引
 * POST   /api/memory/search             向量检索 { query, topK? } → { results: [{conversationId, score}] }
 * POST   /api/memory/search/files       文件语义检索 { query, topK? } → { results: [{fileId, filename, chunkIndex, chunkText, score}] }
 * POST   /api/memory/search/by-id       以已有节点向量做 k-NN { conversationId, topK?, threshold? } → { results: [{conversationId, score}] }
 * GET    /api/memory/profile            读取用户画像
 * PUT    /api/memory/profile            更新用户画像（手动/Agent 写入）
 * DELETE /api/memory/profile            清空用户画像
 * GET    /api/memory/facts              读取 memory facts 列表（仅有效条目）
 * POST   /api/memory/extract            从对话提取并写入 memory facts { conversationId, userMessage, assistantMessage }
 * DELETE /api/memory/facts/:id          软删除单条 fact（设置 invalid_at）
 * DELETE /api/memory/facts              批量软删除全部 facts
 * POST   /api/memory/queue              向 agent 任务队列写入任务 { type, payload }
 * POST   /api/memory/classify           对话主题分类 { text } → { category }
 * GET    /api/memory/logical-edges           所有逻辑边列表（画布加载）
 * GET    /api/memory/logical-edges/:id       指定对话的逻辑边
 * DELETE /api/memory/logical-edges/:id       删除节点相关逻辑边
 */

import { Hono } from 'hono'
import type Database from 'better-sqlite3'
import { enqueueTask } from '../agentWorker'

export const memoryRoutes = new Hono()

/** Get the per-user database from request context */
function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** 从 config 表读取 apiKey / baseUrl */
function getApiConfig(db: InstanceType<typeof Database>): { apiKey: string; baseUrl: string } {
  const keyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as { value: string } | undefined
  const urlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as { value: string } | undefined
  return {
    apiKey: keyRow?.value ?? '',
    baseUrl: (urlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')
  }
}

// 内置 embedding 配置（阿里云，不依赖用户配置）
const BUILTIN_EMBED = {
  apiKey: 'sk-af1d01c2c2ff4e23baafc404b1c23c78',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'text-embedding-v4'  // Qwen3 最新，支持 2048 维
}
const BUILTIN_EMBED_MULTIMODAL = {
  apiKey: 'sk-af1d01c2c2ff4e23baafc404b1c23c78',
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding',
  model: 'qwen3-vl-embedding'  // 多模态：图片+文本统一向量空间
}
let builtinEmbeddingFailed = false

/** 调 embedding API 返回 number[]，使用内置阿里云 key */
export async function fetchEmbedding(
  _db: InstanceType<typeof Database>,  // 保留签名，不再使用 db
  text: string
): Promise<number[] | null> {
  if (builtinEmbeddingFailed) return null

  const input = text.slice(0, 6000)

  try {
    const resp = await fetch(`${BUILTIN_EMBED.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BUILTIN_EMBED.apiKey}`
      },
      body: JSON.stringify({ model: BUILTIN_EMBED.model, input, dimensions: 2048 }),
      signal: AbortSignal.timeout(8_000)
    })

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        builtinEmbeddingFailed = true
        console.error('[memory] BUILTIN embedding key invalid!')
      } else {
        console.warn('[memory] embedding API error:', resp.status)
      }
      return null
    }

    const data = (await resp.json()) as { data: { embedding: number[] }[] }
    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) return null
    return embedding
  } catch (e) {
    console.warn('[memory] fetchEmbedding failed:', e)
    return null
  }
}

/** 多模态 embedding：文本+图片 URL → 统一向量（用于图片文件检索） */
export async function fetchMultimodalEmbedding(
  contents: Array<{ text?: string; image?: string }>
): Promise<number[] | null> {
  if (builtinEmbeddingFailed) return null
  try {
    const resp = await fetch(
      `${BUILTIN_EMBED_MULTIMODAL.baseUrl}/multimodal-embedding`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BUILTIN_EMBED_MULTIMODAL.apiKey}`,
          'X-DashScope-DataInspection': 'enable'
        },
        body: JSON.stringify({
          model: BUILTIN_EMBED_MULTIMODAL.model,
          input: { contents },
          parameters: { dimension: 1024 }
        }),
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (!resp.ok) {
      console.warn('[memory] multimodal embedding error:', resp.status)
      return null
    }
    const data = (await resp.json()) as { output?: { embeddings?: Array<{ embedding: number[] }> } }
    const embedding = data?.output?.embeddings?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) return null
    return embedding
  } catch (e) {
    console.warn('[memory] fetchMultimodalEmbedding failed:', e)
    return null
  }
}

/** Float32Array ↔ Buffer 序列化 */
export function vecToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec)
  return Buffer.from(f32.buffer)
}

function bufferToVec(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** 余弦相似度 */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ─── routes ─────────────────────────────────────────────────────────────────

/** 索引一条对话 */
memoryRoutes.post('/index', async (c) => {
  const db = userDb(c)
  const { conversationId, text } = await c.req.json<{ conversationId: string; text: string }>()
  if (!conversationId || !text) return c.json({ error: 'conversationId and text required' }, 400)

  const vec = await fetchEmbedding(db, text)
  if (!vec) {
    return c.json({ ok: false, reason: 'embedding unavailable' })
  }

  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET vector=excluded.vector, dim=excluded.dim, updated_at=excluded.updated_at
  `).run(conversationId, vecToBuffer(vec), vec.length, now)

  return c.json({ ok: true, dim: vec.length })
})

/** 删除一条对话的索引 */
memoryRoutes.delete('/index/:id', (c) => {
  const db = userDb(c)
  const id = c.req.param('id')
  db.prepare('DELETE FROM embeddings WHERE conversation_id = ?').run(id)
  return c.json({ ok: true })
})

/** 清空全部向量索引（用于重置/体验新手教程） */
memoryRoutes.delete('/index', (c) => {
  const db = userDb(c)
  db.prepare('DELETE FROM embeddings').run()
  return c.json({ ok: true })
})

/** 向量检索 */
memoryRoutes.post('/search', async (c) => {
  const db = userDb(c)
  const { query, topK: rawTopK = 5 } = await c.req.json<{ query: string; topK?: number }>()
  if (!query) return c.json({ results: [] })
  const topK = Math.max(1, Math.min(20, Math.floor(Number(rawTopK) || 5)))

  const queryVec = await fetchEmbedding(db, query)
  if (!queryVec) {
    return c.json({ results: [], fallback: true })
  }

  const queryF32 = new Float32Array(queryVec)

  const rows = db.prepare(
    'SELECT conversation_id, vector, dim FROM embeddings ORDER BY updated_at DESC LIMIT 2000'
  ).all() as { conversation_id: string; vector: Buffer; dim: number }[]

  const scored = rows
    .map(row => {
      const vec = bufferToVec(row.vector)
      const score = cosineSim(queryF32, vec)
      return { conversationId: row.conversation_id, score }
    })
    .filter(r => r.score > 0.5 && !r.conversationId.startsWith('file-'))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return c.json({ results: scored })
})

/** 文件内容语义搜索（独立于对话搜索，搜 file_embeddings 表） */
memoryRoutes.post('/search/files', async (c) => {
  const db = userDb(c)
  const { query, topK: rawTopK = 3 } = await c.req.json<{ query: string; topK?: number }>()
  if (!query) return c.json({ results: [] })
  const topK = Math.max(1, Math.min(10, Math.floor(Number(rawTopK) || 3)))

  const queryVec = await fetchEmbedding(db, query)
  if (!queryVec) return c.json({ results: [], fallback: true })

  const queryF32 = new Float32Array(queryVec)

  const rows = db.prepare(
    'SELECT fe.id, fe.file_id, fe.chunk_index, fe.chunk_text, fe.vector, uf.filename FROM file_embeddings fe JOIN uploaded_files uf ON uf.id = fe.file_id ORDER BY fe.created_at DESC LIMIT 500'
  ).all() as { id: string; file_id: string; chunk_index: number; chunk_text: string; vector: Buffer; filename: string }[]

  const scored = rows
    .map(row => {
      const vec = bufferToVec(row.vector)
      const score = cosineSim(queryF32, vec)
      return { fileId: row.file_id, filename: row.filename, chunkIndex: row.chunk_index, chunkText: row.chunk_text, score }
    })
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return c.json({ results: scored })
})

/** 以已有节点向量为基准做 k-NN，无需额外 embedding 调用（用于节点语义关联） */
memoryRoutes.post('/search/by-id', async (c) => {
  const db = userDb(c)
  const { conversationId, topK: rawTopK = 8, threshold = 0.65 } =
    await c.req.json<{ conversationId: string; topK?: number; threshold?: number }>()

  if (!conversationId) return c.json({ results: [] })
  const topK = Math.max(1, Math.min(20, Number(rawTopK) || 8))
  const thresholdNum = Math.max(0, Math.min(1, Number(threshold) || 0.65))

  const sourceRow = db.prepare(
    'SELECT vector, dim FROM embeddings WHERE conversation_id = ?'
  ).get(conversationId) as { vector: Buffer; dim: number } | undefined

  if (!sourceRow) return c.json({ results: [], reason: 'source not indexed' })

  const sourceVec = bufferToVec(sourceRow.vector)

  const rows = db.prepare(
    `SELECT conversation_id, vector, dim FROM embeddings
     WHERE conversation_id != ? AND conversation_id NOT LIKE 'file-%'
     ORDER BY updated_at DESC LIMIT 2000`
  ).all(conversationId) as { conversation_id: string; vector: Buffer; dim: number }[]

  const scored = rows
    .map(row => {
      const vec = bufferToVec(row.vector)
      if (vec.length !== sourceVec.length) return null  // 维度不匹配时跳过
      const score = cosineSim(sourceVec, vec)
      return { conversationId: row.conversation_id, score }
    })
    .filter((r): r is { conversationId: string; score: number } =>
      r !== null && r.score >= thresholdNum
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return c.json({ results: scored })
})

// ─── user profile ────────────────────────────────────────────────────────────

/** 读取用户画像 */
memoryRoutes.get('/profile', (c) => {
  const db = userDb(c)
  const row = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string> | undefined
  if (!row) return c.json({})

  const safeParseArr = (v: string | undefined): string[] => {
    if (!v) return []
    try { return JSON.parse(v) as string[] } catch { return [] }
  }

  return c.json({
    occupation: row.occupation ?? null,
    interests: safeParseArr(row.interests),
    tools: safeParseArr(row.tools),
    writingStyle: row.writing_style ?? null,
    goals: safeParseArr(row.goals),
    location: row.location ?? null,
    rawNotes: row.raw_notes ?? null,
    lastExtracted: row.last_extracted ?? null,
    updatedAt: row.updated_at
  })
})

/** 更新用户画像（merge，不全量覆盖） */
memoryRoutes.put('/profile', async (c) => {
  const db = userDb(c)
  const body = await c.req.json<{
    occupation?: string; interests?: string[]; tools?: string[];
    writingStyle?: string; goals?: string[]; location?: string; rawNotes?: string
  }>()

  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined

  if (!existing) {
    db.prepare(`
      INSERT INTO user_profile (id, occupation, interests, tools, writing_style, goals, location, raw_notes, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.occupation ?? null,
      body.interests ? JSON.stringify(body.interests) : null,
      body.tools ? JSON.stringify(body.tools) : null,
      body.writingStyle ?? null,
      body.goals ? JSON.stringify(body.goals) : null,
      body.location ?? null,
      body.rawNotes ?? null,
      now
    )
  } else {
    const mergeJson = (existing: string | null, incoming?: string[]) => {
      if (!incoming) return existing
      const base: string[] = existing ? JSON.parse(existing) : []
      const merged = [...new Set([...base, ...incoming])]
      return JSON.stringify(merged)
    }

    db.prepare(`
      UPDATE user_profile SET
        occupation    = COALESCE(?, occupation),
        interests     = ?,
        tools         = ?,
        writing_style = COALESCE(?, writing_style),
        goals         = ?,
        location      = COALESCE(?, location),
        raw_notes     = COALESCE(?, raw_notes),
        updated_at    = ?
      WHERE id = 1
    `).run(
      body.occupation ?? null,
      mergeJson(existing.interests as string | null, body.interests),
      mergeJson(existing.tools as string | null, body.tools),
      body.writingStyle ?? null,
      mergeJson(existing.goals as string | null, body.goals),
      body.location ?? null,
      body.rawNotes ?? null,
      now
    )
  }

  return c.json({ ok: true })
})

/** 前端提交 Agent 任务（画像提取等），fire-and-forget */
memoryRoutes.post('/queue', async (c) => {
  const db = userDb(c)
  const { type, payload } = await c.req.json<{ type: string; payload: Record<string, unknown> }>()
  if (!type) return c.json({ error: 'type required' }, 400)
  enqueueTask(db, type, payload ?? {})
  return c.json({ ok: true })
})

// ─── memory facts (独立记忆板块) ─────────────────────────────────────────────

/** 从对话中 AI 摘取有价值的用户记忆事实 */
memoryRoutes.post('/extract', async (c) => {
  const db = userDb(c)
  const { conversationId, userMessage, assistantMessage } = await c.req.json<{
    conversationId?: string; userMessage: string; assistantMessage?: string
  }>()
  if (!userMessage?.trim()) return c.json({ ok: false, reason: 'userMessage required' })

  if (conversationId) {
    const already = db.prepare('SELECT id FROM memory_facts WHERE source_conv_id = ? LIMIT 1').get(conversationId)
    if (already) return c.json({ ok: true, extracted: 0, skipped: true })
  }

  // 服务端防御性剥离引用块（[REFERENCE_START]...[REFERENCE_END]），只提取对话核心
  const cleanUserMessage = userMessage
    .replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '')
    .trim()
  if (cleanUserMessage.length <= 5) return c.json({ ok: true, extracted: 0, reason: 'only reference content' })

  const { apiKey, baseUrl } = getApiConfig(db)
  if (!apiKey) return c.json({ ok: false, reason: 'no api key' })

  const isMoonshot = baseUrl.includes('moonshot')
  const model = isMoonshot ? 'moonshot-v1-8k' : 'gpt-4o-mini'

  const prompt = `从以下对话中提取用户透露的关于自己的有价值信息（职业/习惯/偏好/目标/经历/个人信息等），以简短的事实句子列出。要求：
- 每条不超过20字
- 只提取用户主动透露的信息，不要推测
- 如果没有有价值的个人信息，返回空数组
- 只返回JSON，不要其他文字

用户说：${cleanUserMessage.slice(0, 400)}
${assistantMessage ? `AI回复：${assistantMessage.slice(0, 200)}` : ''}

返回格式：{"facts": ["事实1", "事实2"]}`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 300
      })
    })
    if (!resp.ok) return c.json({ ok: false, reason: 'api error' })

    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return c.json({ ok: true, extracted: 0 })

    const { facts } = JSON.parse(jsonMatch[0]) as { facts: string[] }
    if (!Array.isArray(facts) || facts.length === 0) return c.json({ ok: true, extracted: 0 })

    const now = new Date().toISOString()
    const insert = db.prepare(`
      INSERT INTO memory_facts (id, fact, source_conv_id, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?)
    `)

    const candidates = facts
      .slice(0, 5)
      .map((f: string) => f?.trim())
      .filter((f: string) => f && f.length > 2)

    if (candidates.length === 0) return c.json({ ok: true, extracted: 0 })

    const existingRows = db.prepare(
      'SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 30'
    ).all() as { fact: string }[]
    const existingFacts = existingRows.map(r => r.fact)

    let toInsert: string[] = candidates

    if (existingFacts.length > 0) {
      try {
        const dedupeResp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: isMoonshot ? 'moonshot-v1-8k' : 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `已有记忆：\n${existingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n新候选：\n${candidates.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n请返回新候选中与已有记忆**语义不重复**的部分（完全相同或意思相同的去掉）。只返回JSON：{"keep": ["事实1", "事实2"]}`
            }],
            temperature: 0,
            max_tokens: 300
          }),
          signal: AbortSignal.timeout(10_000)
        })
        if (dedupeResp.ok) {
          const dedupeData = (await dedupeResp.json()) as { choices: { message: { content: string } }[] }
          const dedupeContent = dedupeData.choices?.[0]?.message?.content || ''
          const jsonMatch = dedupeContent.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              const { keep } = JSON.parse(jsonMatch[0]) as { keep: string[] }
              if (Array.isArray(keep)) {
                const candidateSet = new Set(candidates)
                toInsert = keep.map((f: string) => f?.trim()).filter(f => f && candidateSet.has(f))
              }
            } catch {
              const exactSet = new Set(existingFacts)
              toInsert = candidates.filter((f: string) => !exactSet.has(f))
            }
          }
        }
      } catch {
        const exactSet = new Set(existingFacts)
        toInsert = candidates.filter((f: string) => !exactSet.has(f))
      }
    }

    let inserted = 0
    for (const fact of toInsert) {
      if (fact.length > 2) {
        insert.run(fact, conversationId ?? null, now)
        inserted++
      }
    }

    if (inserted > 0) {
      const totalAfter = (db.prepare('SELECT COUNT(*) as cnt FROM memory_facts WHERE invalid_at IS NULL').get() as { cnt: number }).cnt
      const totalBefore = totalAfter - inserted
      const milestone = Math.floor(totalAfter / 20)
      if (milestone > Math.floor(totalBefore / 20) && milestone > 0) {
        const pending = db.prepare("SELECT id FROM agent_tasks WHERE type = 'consolidate_facts' AND status = 'pending' LIMIT 1").get()
        if (!pending) {
          enqueueTask(db, 'consolidate_facts', {})
          console.log(`[memory/extract] auto-queued consolidate_facts at ${totalAfter} facts`)
        }
      }
    }

    return c.json({ ok: true, extracted: inserted })
  } catch (e) {
    console.warn('[memory/extract] failed:', e)
    return c.json({ ok: false, reason: 'internal error' })
  }
})

/** 读取所有记忆事实（只返回有效的，不返回已失效的） */
memoryRoutes.get('/facts', (c) => {
  const db = userDb(c)
  const rows = db.prepare(
    'SELECT id, fact, source_conv_id, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 200'
  ).all() as { id: string; fact: string; source_conv_id: string | null; created_at: string }[]
  return c.json({ facts: rows })
})

/** 删除单条记忆事实（软删除：标记 invalid_at） */
memoryRoutes.delete('/facts/:id', (c) => {
  const db = userDb(c)
  const id = c.req.param('id')
  db.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  return c.json({ ok: true })
})

/** 编辑单条记忆事实内容 */
memoryRoutes.put('/facts/:id', async (c) => {
  const db = userDb(c)
  const id = c.req.param('id')
  const { fact } = await c.req.json<{ fact: string }>()
  if (!fact?.trim()) return c.json({ error: 'fact required' }, 400)
  db.prepare('UPDATE memory_facts SET fact = ? WHERE id = ? AND invalid_at IS NULL')
    .run(fact.trim(), id)
  return c.json({ ok: true })
})

/** 手动触发记忆整理（合并语义重叠条目），入队 consolidate_facts 任务 */
memoryRoutes.post('/consolidate', (c) => {
  const db = userDb(c)
  const pending = db.prepare("SELECT id FROM agent_tasks WHERE type = 'consolidate_facts' AND status = 'pending' LIMIT 1").get()
  if (pending) return c.json({ ok: true, queued: false, reason: 'already pending' })
  enqueueTask(db, 'consolidate_facts', {})
  return c.json({ ok: true, queued: true })
})

/** 清空全部记忆事实（用于重置/体验新手教程） */
memoryRoutes.delete('/facts', (c) => {
  const db = userDb(c)
  db.prepare('UPDATE memory_facts SET invalid_at = ?').run(new Date().toISOString())
  db.prepare("UPDATE config SET value = '[]', updated_at = ? WHERE key = 'preference_rules'")
    .run(new Date().toISOString())
  db.prepare("DELETE FROM agent_tasks WHERE status = 'pending'").run()
  return c.json({ ok: true })
})

/** 清空用户画像（用于重置/体验新手教程） */
memoryRoutes.delete('/profile', (c) => {
  const db = userDb(c)
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM user_profile WHERE id = 1').get()
  if (existing) {
    db.prepare(`
      UPDATE user_profile SET
        occupation = NULL, interests = NULL, tools = NULL,
        writing_style = NULL, goals = NULL, location = NULL,
        raw_notes = NULL, last_extracted = NULL, updated_at = ?
      WHERE id = 1
    `).run(now)
  }
  return c.json({ ok: true })
})

/** AI 语义分类：将用户消息归类到六大类之一 */
memoryRoutes.post('/classify', async (c) => {
  const db = userDb(c)
  const { text } = await c.req.json<{ text: string }>()
  if (!text?.trim()) return c.json({ category: null })

  const { apiKey, baseUrl } = getApiConfig(db)
  if (!apiKey) return c.json({ category: null })

  const isMoonshot = baseUrl.includes('moonshot')
  const model = isMoonshot ? 'moonshot-v1-8k' : 'gpt-4o-mini'

  const CATEGORIES = ['日常生活', '日常事务', '学习成长', '工作事业', '情感关系', '思考世界', '其他']

  const prompt = `将以下用户问题/话语归类到以下类别之一：日常生活、日常事务、学习成长、工作事业、情感关系、思考世界。如果都不符合就输出"其他"。

类别说明：
- 日常生活：娱乐消费，美食旅游电影游戏购物运动
- 日常事务：现实问题，医疗法律政策出行家庭租房
- 学习成长：知识技能，编程学习语言考试读书
- 工作事业：职业生产，工作职场创业产品项目商业
- 情感关系：人际情绪，恋爱婚姻家人朋友焦虑心理
- 思考世界：抽象思考，哲学人生社会科技价值观

用户说：${text.slice(0, 300)}

只输出类别名称，不要解释。`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 20
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) return c.json({ category: null })
    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
    const matched = CATEGORIES.find(cat => raw.includes(cat))
    return c.json({ category: matched ?? '其他' })
  } catch {
    return c.json({ category: null })
  }
})

/** 读取指定对话的逻辑边 */
memoryRoutes.get('/logical-edges/:conversationId', (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()

  const rows = db.prepare(`
    SELECT id, source_conv, target_conv, relation, reason, confidence, created_at
    FROM logical_edges
    WHERE source_conv = ? OR target_conv = ?
    ORDER BY created_at DESC
  `).all(conversationId, conversationId) as Array<{
    id: string; source_conv: string; target_conv: string;
    relation: string; reason: string; confidence: number; created_at: string
  }>

  return c.json({ edges: rows })
})

/** 读取所有逻辑边（画布加载时批量获取） */
memoryRoutes.get('/logical-edges', (c) => {
  const db = userDb(c)

  const rows = db.prepare(`
    SELECT id, source_conv, target_conv, relation, reason, confidence, created_at
    FROM logical_edges
    ORDER BY created_at DESC
    LIMIT 500
  `).all() as Array<{
    id: string; source_conv: string; target_conv: string;
    relation: string; reason: string; confidence: number; created_at: string
  }>

  return c.json({ edges: rows })
})

/** 删除某节点相关的所有逻辑边 */
memoryRoutes.delete('/logical-edges/:conversationId', (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()
  db.prepare('DELETE FROM logical_edges WHERE source_conv = ? OR target_conv = ?').run(conversationId, conversationId)
  return c.json({ ok: true })
})
