/**
 * Memory routes: embedding-based RAG + user profile
 *
 * POST   /api/memory/index              索引一条对话 { conversationId, text }
 * DELETE /api/memory/index/:id          删除一条对话的索引
 * POST   /api/memory/search             向量检索 { query, topK? } → { results: [{conversationId, score}] }
 * GET    /api/memory/profile            读取用户画像
 * PUT    /api/memory/profile            更新用户画像（手动/Agent 写入）
 */

import { Hono } from 'hono'
import { db } from '../db'
import { enqueueTask } from '../agentWorker'

export const memoryRoutes = new Hono()

// ─── helpers ────────────────────────────────────────────────────────────────

/** 从 config 表读取 apiKey / baseUrl */
function getApiConfig(): { apiKey: string; baseUrl: string } {
  const keyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as { value: string } | undefined
  const urlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as { value: string } | undefined
  return {
    apiKey: keyRow?.value ?? '',
    baseUrl: (urlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')
  }
}

/** 调 embedding API 返回 number[]，兼容 moonshot / openai / 兼容接口 */
async function fetchEmbedding(text: string): Promise<number[] | null> {
  const { apiKey, baseUrl } = getApiConfig()
  if (!apiKey) return null

  // 截断至 4000 字符，避免超 token
  const input = text.slice(0, 4000)

  // moonshot 的 embedding 模型名
  const isMoonshot = baseUrl.includes('moonshot')
  const model = isMoonshot ? 'moonshot-v1-embedding' : 'text-embedding-3-small'

  try {
    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input })
    })

    if (!resp.ok) {
      console.warn('[memory] embedding API error:', resp.status, await resp.text())
      return null
    }

    const data = (await resp.json()) as { data: { embedding: number[] }[] }
    return data?.data?.[0]?.embedding ?? null
  } catch (e) {
    console.warn('[memory] fetchEmbedding failed:', e)
    return null
  }
}

/** Float32Array ↔ Buffer 序列化 */
function vecToBuffer(vec: number[]): Buffer {
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
  const { conversationId, text } = await c.req.json<{ conversationId: string; text: string }>()
  if (!conversationId || !text) return c.json({ error: 'conversationId and text required' }, 400)

  const vec = await fetchEmbedding(text)
  if (!vec) {
    // API Key 未配置或调用失败，静默跳过，不影响主流程
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
  const id = c.req.param('id')
  db.prepare('DELETE FROM embeddings WHERE conversation_id = ?').run(id)
  return c.json({ ok: true })
})

/** 向量检索 */
memoryRoutes.post('/search', async (c) => {
  const { query, topK = 5 } = await c.req.json<{ query: string; topK?: number }>()
  if (!query) return c.json({ results: [] })

  const queryVec = await fetchEmbedding(query)
  if (!queryVec) {
    // 降级：返回空，前端会 fallback 到关键词搜索
    return c.json({ results: [], fallback: true })
  }

  const queryF32 = new Float32Array(queryVec)

  // 读出全部向量（<500条时内存完全可接受，约 1–3 MB）
  const rows = db.prepare('SELECT conversation_id, vector, dim FROM embeddings').all() as
    { conversation_id: string; vector: Buffer; dim: number }[]

  const scored = rows
    .map(row => {
      const vec = bufferToVec(row.vector)
      const score = cosineSim(queryF32, vec)
      return { conversationId: row.conversation_id, score }
    })
    .filter(r => r.score > 0.3) // 过滤掉语义无关的
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return c.json({ results: scored })
})

// ─── user profile ────────────────────────────────────────────────────────────

/** 读取用户画像 */
memoryRoutes.get('/profile', (c) => {
  const row = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string> | undefined
  if (!row) return c.json({})

  return c.json({
    occupation: row.occupation ?? null,
    interests: row.interests ? JSON.parse(row.interests) : [],
    tools: row.tools ? JSON.parse(row.tools) : [],
    writingStyle: row.writing_style ?? null,
    goals: row.goals ? JSON.parse(row.goals) : [],
    location: row.location ?? null,
    rawNotes: row.raw_notes ?? null,
    lastExtracted: row.last_extracted ?? null,
    updatedAt: row.updated_at
  })
})

/** 更新用户画像（merge，不全量覆盖） */
memoryRoutes.put('/profile', async (c) => {
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
    // merge：只更新传入的字段
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
  const { type, payload } = await c.req.json<{ type: string; payload: Record<string, unknown> }>()
  if (!type) return c.json({ error: 'type required' }, 400)
  enqueueTask(type, payload ?? {})
  return c.json({ ok: true })
})
