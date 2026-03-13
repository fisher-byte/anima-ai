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
 * GET    /api/memory/mental-model            读取结构化用户心智模型
 * POST   /api/memory/mental-model/refresh    触发心智模型重新提炼（入队任务）
 * DELETE /api/memory/mental-model            清空心智模型（重置用）
 * POST   /api/memory/rebuild-node-graph      历史节点语义聚类计划 { nodes: [...] } → { clusters: [...] }（只计划不修改）
 */

import { Hono } from 'hono'
import type Database from 'better-sqlite3'
import { enqueueTask } from '../agentWorker'
import {
  fetchEmbedding,
  vecToBuffer, bufferToVec, cosineSim
} from '../lib/embedding'

export { fetchEmbedding, vecToBuffer }

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

// 分类原型向量缓存（服务器启动时初始化一次）
const PROTOTYPE_VECS = new Map<string, Float32Array>()
let prototypeInitDone = false

const CATEGORY_PROTOTYPES: Record<string, string> = {
  '日常生活': '美食餐厅旅游度假电影游戏购物运动健身骑行生活方式休闲娱乐探店种草周末出游咖啡奶茶',
  '日常事务': '医院看病健康保险法律合同租房出行签证税务报销退税行政手续证件感冒生病怎么办',
  '学习成长': '学习编程代码考试读书技能培训语言知识获取自我提升算法数学论文作文英语备考考研',
  '工作事业': '工作职场上班公司离职跳槽求职简历面试薪资绩效晋升创业商业产品需求方案项目运营营销',
  '情感关系': '恋爱感情婚姻家人朋友焦虑情绪心理压力人际关系内心孤独难过沟通幸福快乐温暖陪伴',
  '思考世界': '哲学人生意义价值观社会未来科技世界认知思考观点底层逻辑为什么探讨反思觉察存在意识',
}

export async function initCategoryPrototypes(): Promise<void> {
  if (prototypeInitDone) return
  try {
    await Promise.all(
      Object.entries(CATEGORY_PROTOTYPES).map(async ([cat, text]) => {
        const vec = await fetchEmbedding(null as never, text)
        if (vec) PROTOTYPE_VECS.set(cat, new Float32Array(vec))
      })
    )
    // 只要有至少 4 个分类初始化成功就启用向量分类（部分覆盖好于完全不用）
    prototypeInitDone = PROTOTYPE_VECS.size >= 4
    console.log(`[classify] prototype vectors ready (${PROTOTYPE_VECS.size}/${Object.keys(CATEGORY_PROTOTYPES).length} categories)`)
  } catch (e) {
    // Promise.all 中个别失败不会走这里（各自独立），整体异常才到此
    console.warn('[classify] prototype init failed, will fallback to LLM:', e)
  }
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
    .filter(r => r.score > 0.5
      && !r.conversationId.startsWith('file-')
      && !r.conversationId.startsWith('lenny-')
      && !r.conversationId.startsWith('pg-')
    )
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
                // LLM 可能对字符串做了轻微修改，先精确匹配，再对 trim 后内容做宽松匹配
                const trimmedCandidateMap = new Map(candidates.map(c => [c.trim(), c]))
                toInsert = keep
                  .map((f: string) => f?.trim())
                  .filter(Boolean)
                  .map(f => candidateSet.has(f) ? f : (trimmedCandidateMap.get(f) ?? null))
                  .filter((f): f is string => f !== null)
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
        // B1: 触发心智模型更新，最多在前 5 个里程碑（20/40/60/80/100 facts）
        if (milestone <= 5) {
          const pendingMM = db.prepare("SELECT id FROM agent_tasks WHERE type = 'extract_mental_model' AND status IN ('pending', 'running') LIMIT 1").get()
          if (!pendingMM) {
            enqueueTask(db, 'extract_mental_model', {})
            console.log(`[memory/extract] auto-queued extract_mental_model at ${totalAfter} facts (milestone ${milestone}/5)`)
          }
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

  // 层1：原型向量（内置 key，不依赖用户配置）
  if (prototypeInitDone && PROTOTYPE_VECS.size > 0) {
    const vec = await fetchEmbedding(db, text)
    if (vec) {
      const queryVec = new Float32Array(vec)
      let bestCat = '其他'
      let bestScore = -Infinity
      for (const [cat, protoVec] of PROTOTYPE_VECS) {
        const score = cosineSim(queryVec, protoVec)
        if (score > bestScore) { bestScore = score; bestCat = cat }
      }
      return c.json({ category: bestCat })
    }
  }

  // 层2：LLM（用户 API key）
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

/** 语义话题标签提炼 */
memoryRoutes.post('/extract-topic', async (c) => {
  const db = userDb(c)
  const { userMessage, assistantMessage } = await c.req.json<{
    userMessage: string; assistantMessage: string
  }>()
  if (!userMessage?.trim()) return c.json({ topic: null })

  const { apiKey, baseUrl } = getApiConfig(db)
  if (!apiKey) return c.json({ topic: null })

  const isMoonshot = baseUrl.includes('moonshot')
  const model = isMoonshot ? 'moonshot-v1-8k' : 'gpt-4o-mini'
  const text = `${userMessage.slice(0, 200)}\n${assistantMessage.slice(0, 200)}`
  const prompt = `请用1-2个词（最多8个汉字）总结这段对话的核心话题。
要求：具体个人化（如「Python学习」「和父母的关系」），不要用「学习成长」「工作事业」这类抽象分类词。
只输出话题词，不要解释。

对话内容：${text}`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 20 }),
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) return c.json({ topic: null })
    const data = await resp.json() as any
    const raw = data.choices?.[0]?.message?.content?.trim() ?? null
    return c.json({ topic: raw?.slice(0, 8) ?? null })
  } catch {
    return c.json({ topic: null })
  }
})

/** 批量重新分类节点（修正历史分类错误） */
memoryRoutes.post('/reclassify-nodes', async (c) => {
  const db = userDb(c)
  const { apiKey, baseUrl } = getApiConfig(db)
  if (!apiKey) return c.json({ error: 'no api key' }, 400)

  // Use the storage service approach - read nodes from the request body instead
  const { nodes } = await c.req.json<{ nodes: { id: string; title: string; keywords: string[]; category: string }[] }>()
  if (!nodes?.length) return c.json({ updated: [] })
  // 防止超大请求无限消耗 API 配额
  const nodesBatch = nodes.slice(0, 200)

  const CATEGORIES = ['日常生活', '日常事务', '学习成长', '工作事业', '情感关系', '思考世界', '其他']
  const CATEGORY_COLORS: Record<string, string> = {
    '日常生活': 'rgba(220, 252, 231, 0.9)',
    '日常事务': 'rgba(254, 249, 195, 0.9)',
    '学习成长': 'rgba(219, 234, 254, 0.9)',
    '工作事业': 'rgba(224, 242, 254, 0.9)',
    '情感关系': 'rgba(255, 228, 230, 0.9)',
    '思考世界': 'rgba(243, 232, 255, 0.9)',
    '其他': 'rgba(243, 244, 246, 0.9)',
  }

  const isMoonshot = baseUrl.includes('moonshot')
  const model = isMoonshot ? 'moonshot-v1-8k' : 'gpt-4o-mini'

  // Classify nodes in parallel (batch of 5 at a time)
  const updated: { id: string; category: string; color: string }[] = []

  const classifyOne = async (node: { id: string; title: string; keywords: string[]; category: string }) => {
    const text = [node.title, ...node.keywords].join('，').slice(0, 100)
    const prompt = `将以下内容归类到：日常生活、日常事务、学习成长、工作事业、情感关系、思考世界、其他。\n内容：${text}\n只输出类别名称。`
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 20 }),
        signal: AbortSignal.timeout(6000)
      })
      if (!resp.ok) return
      const data = (await resp.json()) as { choices: { message: { content: string } }[] }
      const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
      const matched = CATEGORIES.find(cat => raw.includes(cat)) ?? '其他'
      if (matched !== node.category) {
        updated.push({ id: node.id, category: matched, color: CATEGORY_COLORS[matched] ?? CATEGORY_COLORS['其他'] })
      }
    } catch { /* skip */ }
  }

  // Process in batches of 5
  for (let i = 0; i < nodesBatch.length; i += 5) {
    await Promise.all(nodesBatch.slice(i, i + 5).map(classifyOne))
  }

  return c.json({ updated })
})

// ─── user mental model (B1) ──────────────────────────────────────────────────

/** 读取结构化用户心智模型 */
memoryRoutes.get('/mental-model', (c) => {
  const db = userDb(c)
  const row = db.prepare('SELECT model_json, updated_at FROM user_mental_model WHERE id = 1').get() as
    { model_json: string; updated_at: string } | undefined
  if (!row) return c.json({ model: null })
  try {
    return c.json({ model: JSON.parse(row.model_json) as Record<string, unknown>, updatedAt: row.updated_at })
  } catch {
    return c.json({ model: null })
  }
})

/** 手动触发 mental model 重新提炼（入队任务，30s 内完成） */
memoryRoutes.post('/mental-model/refresh', (c) => {
  const db = userDb(c)
  const pending = db.prepare("SELECT id FROM agent_tasks WHERE type = 'extract_mental_model' AND status = 'pending' LIMIT 1").get()
  if (pending) return c.json({ ok: true, queued: false, reason: 'already pending' })
  enqueueTask(db, 'extract_mental_model', {})
  return c.json({ ok: true, queued: true })
})

/** 清空心智模型（重置/新手教程用） */
memoryRoutes.delete('/mental-model', (c) => {
  const db = userDb(c)
  db.prepare("UPDATE user_mental_model SET model_json = '{}', updated_at = ? WHERE id = 1").run(new Date().toISOString())
  return c.json({ ok: true })
})

/** 读取指定对话的逻辑边 */
memoryRoutes.get('/logical-edges/:conversationId', (c) => {  const db = userDb(c)
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

/** 历史节点语义聚类计划（只返回计划，不修改数据） */
memoryRoutes.post('/rebuild-node-graph', async (c) => {
  const db = userDb(c)
  const { nodes } = await c.req.json<{
    nodes: Array<{ id: string; conversationIds: string[]; firstDate: string }>
  }>()

  if (!nodes || nodes.length < 2) {
    return c.json({ clusters: [], reason: 'not-enough-nodes' })
  }

  const ADJACENCY_THRESHOLD = 0.75
  const SANITY_THRESHOLD    = 0.60
  const TEMPORAL_STRICT     = 0.82

  // 为每个节点计算代表 embedding（多 convId 取平均）
  const nodeVecs: Map<string, Float32Array> = new Map()
  for (const node of nodes) {
    const vecs: Float32Array[] = []
    for (const cid of node.conversationIds) {
      const row = db.prepare('SELECT vector FROM embeddings WHERE conversation_id = ? LIMIT 1').get(cid) as { vector: Buffer } | undefined
      if (row?.vector) {
        const v = bufferToVec(row.vector)
        if (v) vecs.push(v)
      }
    }
    if (vecs.length === 0) continue
    const dim = vecs[0].length
    const avg = new Float32Array(dim)
    for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
    for (let i = 0; i < dim; i++) avg[i] /= vecs.length
    nodeVecs.set(node.id, avg)
  }

  const nodeIds = [...nodeVecs.keys()]
  if (nodeIds.length < 2) return c.json({ clusters: [], reason: 'no-embeddings' })

  // Union-Find（路径压缩）
  const parent = new Map(nodeIds.map(id => [id, id]))
  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }
  function union(x: string, y: string) {
    parent.set(find(x), find(y))
  }

  // 建边 + 时间跨度守卫
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const nA = nodes.find(n => n.id === nodeIds[i])!
      const nB = nodes.find(n => n.id === nodeIds[j])!
      const daysDiff = Math.abs(
        new Date(nA.firstDate).getTime() - new Date(nB.firstDate).getTime()
      ) / 86400000

      const score = cosineSim(nodeVecs.get(nodeIds[i])!, nodeVecs.get(nodeIds[j])!)
      const threshold = daysDiff > 60 ? TEMPORAL_STRICT : ADJACENCY_THRESHOLD

      if (score >= threshold) union(nodeIds[i], nodeIds[j])
    }
  }

  // 聚合 clusters
  const clusterMap = new Map<string, string[]>()
  for (const id of nodeIds) {
    const root = find(id)
    if (!clusterMap.has(root)) clusterMap.set(root, [])
    clusterMap.get(root)!.push(id)
  }

  // 过滤单节点 cluster，做 sanity check，生成计划
  const clusters: Array<{ keepNodeId: string; mergeNodeIds: string[]; mergedConversationIds: string[] }> = []

  for (const [, members] of clusterMap) {
    if (members.length < 2) continue

    // Sanity check：cluster 内两两最低 cosineSim ≥ SANITY_THRESHOLD
    let sane = true
    outer: for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const vA = nodeVecs.get(members[i])!
        const vB = nodeVecs.get(members[j])!
        if (cosineSim(vA, vB) < SANITY_THRESHOLD) { sane = false; break outer }
      }
    }
    if (!sane) continue

    // 选 keepNode：最多 conversationIds，平则最老 firstDate
    const memberNodes = members.map(id => nodes.find(n => n.id === id)!)
    memberNodes.sort((a, b) => {
      const diff = b.conversationIds.length - a.conversationIds.length
      if (diff !== 0) return diff
      return a.firstDate.localeCompare(b.firstDate)
    })
    const keepNode = memberNodes[0]
    const mergeNodes = memberNodes.slice(1)
    const mergedConvIds = mergeNodes.flatMap(n => n.conversationIds)

    clusters.push({
      keepNodeId: keepNode.id,
      mergeNodeIds: mergeNodes.map(n => n.id),
      mergedConversationIds: mergedConvIds
    })
  }

  return c.json({
    clusters,
    totalNodes: nodeIds.length,
    totalMerges: clusters.reduce((sum, cl) => sum + cl.mergeNodeIds.length, 0)
  })
})

/** 删除某节点相关的所有逻辑边 */
memoryRoutes.delete('/logical-edges/:conversationId', (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()
  db.prepare('DELETE FROM logical_edges WHERE source_conv = ? OR target_conv = ?').run(conversationId, conversationId)
  return c.json({ ok: true })
})

/**
 * POST /api/memory/sync-lenny-conv
 * Body: { conversationId, userMessage, assistantMessage }
 *
 * Lenny 对话结束后同步写入用户的 conversations.jsonl，
 * 并触发记忆提取（extract_memory + extract_preferences agent 任务）。
 */
memoryRoutes.post('/sync-lenny-conv', async (c) => {
  const db = userDb(c)
  const { conversationId, userMessage, assistantMessage, source } = await c.req.json<{
    conversationId: string
    userMessage: string
    assistantMessage: string
    source?: string  // 'lenny' | 'pg'，默认 'lenny'
  }>()

  if (!conversationId || !userMessage) {
    return c.json({ ok: false, error: 'missing fields' }, 400)
  }
  const safeAssistant = assistantMessage?.trim() ?? ''
  // 支持 'lenny' | 'pg' | 'zhang' | 'wang' | 'custom-<id>'
  const isCustom = source?.startsWith('custom-')
  const convSource = isCustom ? source! : (source === 'pg' ? 'pg' : source === 'zhang' ? 'zhang' : source === 'wang' ? 'wang' : 'lenny')

  const now = new Date().toISOString()
  const conv = {
    id: `${convSource}-${conversationId}`,
    createdAt: now,
    userMessage,
    assistantMessage: safeAssistant,
    source: convSource,
    images: [],
    files: [],
  }

  // 1. Append to user's conversations.jsonl
  try {
    const existing = (db.prepare("SELECT content FROM storage WHERE filename = 'conversations.jsonl'").get() as { content: string } | undefined)?.content ?? ''
    // 幂等：JSON 解析后精确匹配 id，避免 string.includes 的前缀误判（如 lenny-123 误匹配 lenny-1234）
    const existingIds = new Set(
      existing.trim().split('\n').filter(Boolean).map(line => {
        try { return (JSON.parse(line) as { id?: string }).id ?? '' } catch { return '' }
      })
    )
    if (!existingIds.has(conv.id)) {
      const updated = existing ? `${existing}\n${JSON.stringify(conv)}` : JSON.stringify(conv)
      db.prepare("INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at")
        .run('conversations.jsonl', updated, now)
    }
  } catch (e) {
    console.error('[sync-lenny-conv] failed to write conversations.jsonl', e)
    return c.json({ ok: false }, 500)
  }

  // 2. 在主空间 nodes.json 里生成对应节点（让用户在画布上看到这条对话）
  if (safeAssistant) {
    try {
      const nodesRaw = (db.prepare("SELECT content FROM storage WHERE filename = 'nodes.json'").get() as { content: string } | undefined)?.content ?? '[]'
      const nodes: Array<Record<string, unknown>> = JSON.parse(nodesRaw)

      // 幂等：节点已存在则不重复添加
      const alreadyExists = nodes.some((n) => n.id === conv.id || n.conversationId === conv.id)
      if (!alreadyExists) {
        // 分类：基于 userMessage 内容启发
        const lower = (userMessage + ' ' + safeAssistant).toLowerCase()
        let category = '工作事业'
        if (/relationship|team|family|friend|emotion|感情|家人|朋友|情感|恋爱|婚姻/.test(lower)) category = '关系情感'
        else if (/think|philosophy|belief|mindset|meaning|哲学|思考|价值观|世界|意义/.test(lower)) category = '思考世界'
        else if (/health|sleep|workout|diet|body|睡眠|健康|锻炼|饮食|身体/.test(lower)) category = '身心健康'
        else if (/learn|study|book|course|skill|学习|读书|技能|考试|成长/.test(lower)) category = '学习成长'

        // 螺旋布局：找一个不与现有节点重叠的位置
        const centerX = nodes.length > 0 ? (nodes.reduce((s, n) => s + (n.x as number || 1920), 0) / nodes.length) : 1920
        const centerY = nodes.length > 0 ? (nodes.reduce((s, n) => s + (n.y as number || 1200), 0) / nodes.length) : 1200
        const goldenAngle = Math.PI * (3 - Math.sqrt(5))
        let nx = centerX + 350, ny = centerY
        for (let i = 0; i < 200; i++) {
          const r = 320 * Math.sqrt(i + 1)
          const theta = i * goldenAngle
          const cx = centerX + r * Math.cos(theta)
          const cy = centerY + r * Math.sin(theta)
          if (!nodes.some((n) => Math.hypot((n.x as number) - cx, (n.y as number) - cy) < 280)) {
            nx = cx; ny = cy; break
          }
        }

        // 关键词：从 userMessage 中提取（简单分词，去停用词）
        const stopWords = new Set(['their','about','which','would','could','there','other',
          'where','should','these','those','being','after','while','between','through',
          'before','under','think','right','every','start','point','might','often','first','since',
          '这样','什么','那么','就是','一个','我们','他们','可以','没有','还是','已经','因为','所以'])
        const keywords = userMessage
          .replace(/[#*`>\[\]()]/g, ' ')
          .toLowerCase()
          .split(/[\s，。！？,.!?]+/)
          .filter(w => w.length > 2 && !stopWords.has(w))
          .slice(0, 3)

        const newNode = {
          id: conv.id,
          title: userMessage.slice(0, 30),
          keywords,
          date: now.split('T')[0],
          conversationId: conv.id,
          x: Math.round(nx),
          y: Math.round(ny),
          category,
          nodeType: 'conversation',
          conversationIds: [conv.id],
          topicLabel: category,
          firstDate: now.split('T')[0],
        }
        nodes.push(newNode)
        db.prepare("INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at")
          .run('nodes.json', JSON.stringify(nodes), now)
      }
    } catch (e) {
      console.error('[sync-lenny-conv] failed to write nodes.json', e)
      // non-fatal：节点写失败不影响对话记录和记忆提取
    }
  }

  // 3. 记忆提取任务
  if (safeAssistant) {
    try {
      enqueueTask(db, 'extract_profile', { conversationId: conv.id, userMessage, assistantMessage: safeAssistant })
      enqueueTask(db, 'extract_preference', { conversationId: conv.id, userMessage, assistantMessage: safeAssistant })
    } catch { /* non-fatal */ }

    // 向量索引（fire-and-forget）
    const indexText = userMessage + ' ' + safeAssistant
    fetchEmbedding(db, indexText).then(vec => {
      if (!vec) return
      const ts = new Date().toISOString()
      try {
        db.prepare(`
          INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(conversation_id) DO UPDATE SET vector=excluded.vector, dim=excluded.dim, updated_at=excluded.updated_at
        `).run(conv.id, vecToBuffer(vec), vec.length, ts)
      } catch { /* non-fatal */ }
    }).catch(() => {})
  }

  return c.json({ ok: true })
})

/**
 * POST /api/memory/bootstrap-facts
 *
 * 历史对话补全：扫描 conversations.jsonl，对尚未提取过记忆事实的对话
 * 逐条入队 extract_profile + extract_preference 任务；同时对缺少向量的
 * 历史对话补触发 fetchEmbedding（fire-and-forget）。
 * 每次最多处理 200 条，防止队列膨胀。
 * 幂等：已有 memory_facts.source_conv_id 或已有 embeddings 记录的跳过对应步骤。
 */
memoryRoutes.post('/bootstrap-facts', async (c) => {
  const db = userDb(c)

  // 读取 conversations.jsonl
  const row = db.prepare("SELECT content FROM storage WHERE filename = 'conversations.jsonl'").get() as
    { content: string } | undefined
  if (!row?.content) return c.json({ ok: true, queued: 0, reason: 'no conversations' })

  const lines = row.content.trim().split('\n').filter(Boolean)

  // 已提取过记忆的 conv id 集合
  const extracted = new Set(
    (db.prepare('SELECT DISTINCT source_conv_id FROM memory_facts WHERE source_conv_id IS NOT NULL').all() as
      { source_conv_id: string }[]).map(r => r.source_conv_id)
  )

  // 解析并去重（同 id 取最后一条）
  const convMap = new Map<string, { id: string; userMessage: string; assistantMessage: string }>()
  for (const line of lines) {
    try {
      const conv = JSON.parse(line) as { id: string; userMessage?: string; assistantMessage?: string }
      if (conv.id && conv.userMessage?.trim()) convMap.set(conv.id, {
        id: conv.id,
        userMessage: conv.userMessage,
        assistantMessage: conv.assistantMessage ?? '',
      })
    } catch { /* ignore */ }
  }

  // 已有向量索引的 conv id 集合
  const indexedSet = new Set(
    (db.prepare('SELECT conversation_id FROM embeddings').all() as { conversation_id: string }[])
      .map(r => r.conversation_id)
  )

  // 过滤出未提取的（记忆事实维度）
  const toProcess = [...convMap.values()].filter(cv => !extracted.has(cv.id)).slice(0, 200)
  if (toProcess.length === 0) return c.json({ ok: true, queued: 0, reason: 'all already extracted' })

  let queued = 0
  for (const conv of toProcess) {
    const cleanMsg = conv.userMessage
      .replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '')
      .trim()
    if (cleanMsg.length <= 5) continue

    // 入队 extract_profile（画像提取）
    enqueueTask(db, 'extract_profile', {
      userMessage: cleanMsg,
      assistantMessage: conv.assistantMessage.slice(0, 600),
    })

    // 入队 extract_preference（偏好规则提取）
    enqueueTask(db, 'extract_preference', {
      userMessage: cleanMsg,
      assistantMessage: conv.assistantMessage.slice(0, 600),
    })

    queued++

    // 补全向量索引（如果缺失）—— fire-and-forget，不阻塞响应
    if (!indexedSet.has(conv.id)) {
      const indexText = conv.userMessage + ' ' + conv.assistantMessage
      fetchEmbedding(db, indexText).then(vec => {
        if (!vec) return
        const ts = new Date().toISOString()
        try {
          db.prepare(`
            INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET vector=excluded.vector, dim=excluded.dim, updated_at=excluded.updated_at
          `).run(conv.id, vecToBuffer(vec), vec.length, ts)
        } catch { /* non-fatal */ }
      }).catch(() => {})
    }
  }

  console.log(`[bootstrap-facts] queued ${queued} conversations for profile+preference extraction`)
  return c.json({ ok: true, queued, total: convMap.size, alreadyExtracted: extracted.size })
})
