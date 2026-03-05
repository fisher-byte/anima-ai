/**
 * Agent Worker — 后台轻量 AI 任务处理器
 *
 * 每 30 秒检查 agent_tasks 表中的 pending 任务：
 *   - extract_profile:   从对话中提取用户画像增量
 *   - extract_preference: 从用户反馈中提取偏好规则
 *   - embed_file:        对上传文件的文本内容分块并生成 embedding（存入 file_embeddings 表）
 *
 * 使用最便宜的模型（moonshot-v1-8k），fire-and-forget。
 * 任务由前端在对话完成后写入队列（status='pending'）。
 */

import { db } from './db'

interface ExtractProfilePayload {
  userMessage: string
  assistantMessage: string
}

interface ExtractPreferencePayload {
  userMessage: string
  assistantMessage: string
}

interface EmbedFilePayload {
  fileId: string
  textContent: string
  filename: string
}

/** 把现有 facts 传给 LLM，合并语义重叠条目，软删除旧条目，写入合并后的新条目 */
async function consolidateFacts(): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig()
  if (!apiKey) return

  const rows = db.prepare(
    'SELECT id, fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at ASC'
  ).all() as { id: string; fact: string }[]

  if (rows.length < 5) return // 太少不用整理

  const factsText = rows.map((r, i) => `${i + 1}. ${r.fact}`).join('\n')

  const prompt = `以下是关于同一个用户的记忆条目，按时间顺序排列（越靠后越新）。

记忆条目（序号 = 时间顺序，越大越新）：
${factsText}

整理规则：
1. **新信息优先**：如果新旧条目描述同一件事但内容不同（如职业变化、状态更新），保留更新的那条，丢弃旧的
2. **真正重复才合并**：只有意思完全相同或包含关系的条目才合并为一条更完整的表述
3. **不相关不合并**：主题不同的条目（如职业 vs 兴趣爱好 vs 健康状况）保持独立，不要强行合并成一条
4. **保留独特信息**：每条条目中的独特信息不得丢失
5. **简洁表达**：每条合并后的记忆不超过 25 字

只返回 JSON，不要解释：{"facts": ["条目1", "条目2", ...]}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.1
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!resp.ok) return

    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const { facts: consolidated } = JSON.parse(jsonMatch[0]) as { facts: string[] }
    if (!Array.isArray(consolidated) || consolidated.length === 0) return

    // 合并后条目数必须 <= 原来（防止模型 hallucinate 新内容），且不应超过原来数量
    const cleaned = consolidated.map(f => f?.trim()).filter(f => f && f.length > 2)
    if (cleaned.length > rows.length) return

    const now = new Date().toISOString()
    // 在事务中：软删除所有旧条目，写入新条目
    const softDelete = db.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?')
    const insert = db.prepare(
      "INSERT INTO memory_facts (id, fact, source_conv_id, created_at) VALUES (lower(hex(randomblob(16))), ?, 'consolidated', ?)"
    )
    db.transaction(() => {
      for (const row of rows) softDelete.run(now, row.id)
      for (const fact of cleaned) insert.run(fact, now)
    })()

    console.log(`[agent] consolidate_facts: ${rows.length} → ${cleaned.length} facts`)
  } catch (e) {
    console.warn('[agent] consolidateFacts failed:', e)
  }
}

/** 从 config 表读取 apiKey / baseUrl */
function getApiConfig(): { apiKey: string; baseUrl: string; model: string } {
  const keyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as { value: string } | undefined
  const urlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as { value: string } | undefined
  return {
    apiKey: keyRow?.value ?? '',
    baseUrl: (urlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, ''),
    // 画像提取始终用最便宜模型，不受用户主模型配置影响
    model: 'moonshot-v1-8k'
  }
}

/** AI 提取画像增量，返回 partial UserProfile JSON */
async function extractProfileFromConversation(
  userMessage: string,
  _assistantMessage: string
): Promise<Record<string, unknown> | null> {
  const { apiKey, baseUrl, model } = getApiConfig()
  if (!apiKey) return null
  if (userMessage.trim().length < 20) return null

  const prompt = `你是用户画像提取器。只读取【用户的发言】，忽略助手的回答部分。

用户说的话：
${userMessage.slice(0, 500)}

（助手的回复仅供参考，不要从中提取任何字段。）

只提取用户发言中能直接推断的信息，返回 JSON。如果某字段无法从用户发言推断就省略该字段。
格式：
{
  "occupation": "职业（如程序员、设计师、学生等）",
  "interests": ["兴趣1", "兴趣2"],
  "tools": ["常用工具或技术"],
  "goals": ["当前目标或关注点"],
  "location": "城市或地区",
  "writing_style": "用户偏好的回答风格（如简洁/详细/技术性等）"
}

只返回 JSON，不要解释。如果完全无法推断任何字段，返回 {}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!resp.ok) return null
    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''

    // 提取 JSON（模型可能包裹在 ```json ``` 里）
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.warn('[agent] extractProfile failed:', e)
    return null
  }
}

/** AI 判断用户反馈是否包含偏好信息，如有则写入 profile.rules */
async function extractPreferenceFromFeedback(
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig()
  if (!apiKey) return
  if (userMessage.trim().length < 5) return

  const prompt = `判断用户的回复中是否包含对 AI 回答方式的明确偏好或反馈（如"太长了""别用列表""更直接一点"等）。

用户说：${userMessage.slice(0, 400)}
AI之前说：${assistantMessage.slice(0, 200)}

如果包含偏好，返回 JSON：{"preference": "一句话描述偏好规则，用于指导未来回答方式"}
如果不包含偏好（如普通问答、闲聊），返回：{}
只返回 JSON，不要解释。`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.2
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!resp.ok) return
    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return
    const parsed = JSON.parse(jsonMatch[0]) as { preference?: string }
    if (!parsed.preference?.trim()) return

    // 写入 profile.rules（同步到 storage 表的 profile.json，与前端共享同一数据源）
    const profileRow = db.prepare('SELECT content FROM storage WHERE filename = ?').get('profile.json') as { content: string } | undefined
    let existingProfile: { rules?: Array<{ trigger: string; preference: string; confidence: number; updatedAt: string }> } = {}
    if (profileRow?.content) {
      try { existingProfile = JSON.parse(profileRow.content) } catch {}
    }
    const rules = existingProfile.rules ?? []

    const today = new Date().toISOString().split('T')[0]
    const newRule = { trigger: userMessage.slice(0, 40), preference: parsed.preference, confidence: 0.7, updatedAt: today }
    // 去重：精确匹配 OR 新规则是已有规则的子串 OR 已有规则是新规则的子串（避免同义改写重复写入）
    const newPref = parsed.preference.trim()
    if (rules.some(r => {
      const existing = r.preference.trim()
      return existing === newPref || existing.includes(newPref) || newPref.includes(existing)
    })) return

    rules.push(newRule)
    const updatedProfile = { ...existingProfile, rules }
    const profileJson = JSON.stringify(updatedProfile, null, 2)
    const nowTs = new Date().toISOString()
    if (profileRow) {
      db.prepare('UPDATE storage SET content = ?, updated_at = ? WHERE filename = ?').run(profileJson, nowTs, 'profile.json')
    } else {
      db.prepare('INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?)').run('profile.json', profileJson, nowTs)
    }
    // 同时保留 config 表同步（供其他可能的读取方保持兼容）
    const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('preference_rules') as { value: string } | undefined
    const val = JSON.stringify(rules)
    if (existing) {
      db.prepare('UPDATE config SET value = ?, updated_at = ? WHERE key = ?').run(val, new Date().toISOString(), 'preference_rules')
    } else {
      db.prepare('INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)').run('preference_rules', val, new Date().toISOString())
    }
  } catch (e) {
    console.warn('[agent] extractPreference failed:', e)
  }
}


function mergeProfile(extracted: Record<string, unknown>) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined

  const mergeArr = (existing: string | null, incoming: unknown): string | null => {
    if (!incoming || !Array.isArray(incoming)) return existing
    const base: string[] = existing ? JSON.parse(existing) : []
    return JSON.stringify([...new Set([...base, ...(incoming as string[])])])
  }

  if (!existing) {
    db.prepare(`
      INSERT INTO user_profile (id, occupation, interests, tools, writing_style, goals, location, last_extracted, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      extracted.occupation ?? null,
      extracted.interests ? JSON.stringify(extracted.interests) : null,
      extracted.tools ? JSON.stringify(extracted.tools) : null,
      extracted.writing_style ?? null,
      extracted.goals ? JSON.stringify(extracted.goals) : null,
      extracted.location ?? null,
      now, now
    )
  } else {
    db.prepare(`
      UPDATE user_profile SET
        occupation    = COALESCE(?, occupation),
        interests     = ?,
        tools         = ?,
        writing_style = COALESCE(?, writing_style),
        goals         = ?,
        location      = COALESCE(?, location),
        last_extracted = ?,
        updated_at    = ?
      WHERE id = 1
    `).run(
      extracted.occupation ?? null,
      mergeArr(existing.interests, extracted.interests),
      mergeArr(existing.tools, extracted.tools),
      extracted.writing_style ?? null,
      mergeArr(existing.goals, extracted.goals),
      extracted.location ?? null,
      now, now
    )
  }
}

/**
 * 文本分块（参照 LangChain RecursiveCharacterTextSplitter 思路）
 * 在自然边界（段落 > 句子 > 词）处切分，保留 10% 重叠以维持语义连续性
 */
function splitTextIntoChunks(text: string, chunkSize = 800, overlap = 80): string[] {
  if (text.length <= chunkSize) return [text]

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize

    if (end >= text.length) {
      chunks.push(text.slice(start))
      break
    }

    // 优先在段落边界切分
    let splitAt = text.lastIndexOf('\n\n', end)
    if (splitAt <= start) splitAt = text.lastIndexOf('\n', end)
    if (splitAt <= start) splitAt = text.lastIndexOf('。', end)
    if (splitAt <= start) splitAt = text.lastIndexOf('. ', end)
    if (splitAt <= start) splitAt = text.lastIndexOf(' ', end)
    if (splitAt <= start) splitAt = end

    chunks.push(text.slice(start, splitAt + 1))
    start = Math.max(start + 1, splitAt + 1 - overlap)
  }

  return chunks.filter(c => c.trim().length > 0)
}

/** 对文件内容分块并生成 embedding，写入 file_embeddings 表 */
async function embedFileContent(fileId: string, textContent: string, filename: string): Promise<void> {
  const { apiKey, baseUrl } = getApiConfig()
  if (!apiKey) {
    db.prepare("UPDATE uploaded_files SET embed_status = 'failed' WHERE id = ?").run(fileId)
    return
  }

  const isMoonshot = baseUrl.includes('moonshot')
  const embModel = isMoonshot ? 'moonshot-v1-embedding' : 'text-embedding-3-small'

  const chunks = splitTextIntoChunks(textContent)
  let embeddedCount = 0

  // 清除旧的分块（重新嵌入时先删除）
  db.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run(fileId)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const resp = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: embModel, input: chunk }),
        signal: AbortSignal.timeout(10_000)
      })

      if (!resp.ok) {
        console.warn(`[agent] embed_file chunk ${i} failed for ${filename}:`, resp.status)
        continue
      }

      const data = (await resp.json()) as { data: { embedding: number[] }[] }
      const vec = data?.data?.[0]?.embedding
      if (!Array.isArray(vec) || vec.length === 0) continue

      const f32 = new Float32Array(vec)
      const vecBuf = Buffer.from(f32.buffer)
      const chunkId = `${fileId}-chunk-${i}`

      db.prepare(`
        INSERT OR REPLACE INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(chunkId, fileId, i, chunk, vecBuf, vec.length, new Date().toISOString())

      embeddedCount++
    } catch (e) {
      console.warn(`[agent] embed_file chunk ${i} error for ${filename}:`, e)
    }
  }

  // 更新文件状态
  const status = embeddedCount > 0 ? 'done' : 'failed'
  db.prepare('UPDATE uploaded_files SET embed_status = ?, chunk_count = ? WHERE id = ?').run(status, embeddedCount, fileId)
  console.log(`[agent] embed_file ${filename}: ${embeddedCount}/${chunks.length} chunks embedded, status=${status}`)
}

/** 处理单条任务 */
async function processTask(task: { id: number; type: string; payload: string; retries?: number }) {
  const now = new Date().toISOString()
  db.prepare('UPDATE agent_tasks SET status = ?, started_at = ? WHERE id = ?').run('running', now, task.id)


  try {
    if (task.type === 'extract_profile') {
      const payload = JSON.parse(task.payload) as ExtractProfilePayload
      const extracted = await extractProfileFromConversation(payload.userMessage, payload.assistantMessage)
      if (extracted && Object.keys(extracted).length > 0) {
        mergeProfile(extracted)
      }
    } else if (task.type === 'extract_preference') {
      const payload = JSON.parse(task.payload) as ExtractPreferencePayload
      await extractPreferenceFromFeedback(payload.userMessage, payload.assistantMessage)
    } else if (task.type === 'embed_file') {
      const payload = JSON.parse(task.payload) as EmbedFilePayload
      await embedFileContent(payload.fileId, payload.textContent, payload.filename)
    } else if (task.type === 'consolidate_facts') {
      await consolidateFacts()
    }

    db.prepare('UPDATE agent_tasks SET status = ?, finished_at = ? WHERE id = ?').run('done', new Date().toISOString(), task.id)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const retries = (task.retries ?? 0) + 1
    if (retries < 3) {
      // 指数退避重试：重新标记为 pending，error 字段记录上次错误
      db.prepare('UPDATE agent_tasks SET status = ?, retries = ?, error = ?, started_at = NULL WHERE id = ?')
        .run('pending', retries, errMsg, task.id)
      console.warn(`[agent] task ${task.id} failed (attempt ${retries}/3), will retry:`, errMsg)
    } else {
      db.prepare('UPDATE agent_tasks SET status = ?, error = ?, finished_at = ? WHERE id = ?')
        .run('failed', errMsg, new Date().toISOString(), task.id)
      console.warn(`[agent] task ${task.id} permanently failed after 3 attempts:`, errMsg)
    }
  }
}

/** 检查并处理 pending 任务 */
async function tick() {
  const tasks = db.prepare(
    'SELECT id, type, payload, retries FROM agent_tasks WHERE status = ? ORDER BY id ASC LIMIT 5'
  ).all('pending') as { id: number; type: string; payload: string; retries: number }[]

  for (const task of tasks) {
    await processTask(task)
  }
}

/** 清理旧任务：删除 7 天前已完成/失败的任务 */
function cleanOldTasks() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const deleted = db.prepare(
    "DELETE FROM agent_tasks WHERE status IN ('done', 'failed') AND finished_at < ?"
  ).run(cutoff)
  if (deleted.changes > 0) {
    console.log(`[agent] cleaned up ${deleted.changes} old tasks`)
  }
}

/** 启动 Worker，每 30 秒 tick 一次 */
export function startAgentWorker() {
  console.log('[agent] Worker started')

  // 崩溃恢复：将上次进程中卡住的 running 任务重置为 pending
  const stalled = db.prepare("UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running'").run()
  if (stalled.changes > 0) {
    console.log(`[agent] recovered ${stalled.changes} stalled tasks from previous run`)
  }

  // 启动时对 profile.rules 做一次子串去重清洗（清理历史重复写入的规则）
  try {
    const profileRow = db.prepare('SELECT content FROM storage WHERE filename = ?').get('profile.json') as { content: string } | undefined
    if (profileRow?.content) {
      const parsed = JSON.parse(profileRow.content) as { rules?: Array<{ preference: string; [k: string]: unknown }> }
      const rules = parsed.rules ?? []
      if (rules.length > 1) {
        // 保留：对于互相包含的规则，保留较长的（更具体）
        const deduped = rules.filter((r, i) => {
          const pref = r.preference.trim()
          return !rules.some((other, j) => {
            if (i === j) return false
            const otherPref = other.preference.trim()
            // 如果当前是 other 的子串（other 更长更具体），则移除当前
            return otherPref.includes(pref) && otherPref.length > pref.length
          })
        })
        if (deduped.length < rules.length) {
          const updatedProfile = { ...parsed, rules: deduped }
          const nowTs = new Date().toISOString()
          db.prepare('UPDATE storage SET content = ?, updated_at = ? WHERE filename = ?')
            .run(JSON.stringify(updatedProfile, null, 2), nowTs, 'profile.json')
          const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('preference_rules') as { value: string } | undefined
          if (existing) {
            db.prepare('UPDATE config SET value = ?, updated_at = ? WHERE key = ?').run(JSON.stringify(deduped), nowTs, 'preference_rules')
          }
          console.log(`[agent] deduped preference rules: ${rules.length} → ${deduped.length}`)
        }
      }
    }
  } catch (e) {
    console.warn('[agent] rule dedup on startup failed:', e)
  }

  // 立即跑一次（处理服务重启前未完成的任务）
  tick().catch(e => console.warn('[agent] initial tick error:', e))

  setInterval(() => {
    tick().catch(e => console.warn('[agent] tick error:', e))
  }, 30_000)

  // 每小时清理一次旧任务
  setInterval(() => {
    try { cleanOldTasks() } catch (e) { console.warn('[agent] cleanOldTasks error:', e) }
  }, 60 * 60 * 1000)
}

/** 向队列写入任务（前端通过 /api/memory/queue POST 调用，或 server 内部直接调用） */
export function enqueueTask(type: string, payload: Record<string, unknown>) {
  db.prepare(
    'INSERT INTO agent_tasks (type, payload, status, created_at) VALUES (?, ?, ?, ?)'
  ).run(type, JSON.stringify(payload), 'pending', new Date().toISOString())
}
