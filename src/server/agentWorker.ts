/**
 * Agent Worker — 后台轻量 AI 任务处理器
 *
 * 每 30 秒检查 agent_tasks 表中的 pending 任务：
 *   - extract_profile: 从对话中提取用户画像增量
 *
 * 使用最便宜的模型（moonshot-v1-8k），fire-and-forget。
 * 任务由前端在对话完成后写入队列（status='pending'）。
 */

import { db } from './db'

interface ExtractProfilePayload {
  userMessage: string
  assistantMessage: string
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
  assistantMessage: string
): Promise<Record<string, unknown> | null> {
  const { apiKey, baseUrl, model } = getApiConfig()
  if (!apiKey) return null

  const prompt = `你是用户画像提取器。阅读下面这段对话，从用户的发言中提取能直接推断的信息。

对话：
用户：${userMessage.slice(0, 500)}
助手：${assistantMessage.slice(0, 300)}

只提取对话中能直接推断的字段，返回 JSON。如果某字段无法推断就省略该字段。
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
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3
      })
    })

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

/** 将提取结果 merge 到 user_profile 表 */
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

/** 处理单条任务 */
async function processTask(task: { id: number; type: string; payload: string }) {
  const now = new Date().toISOString()
  db.prepare('UPDATE agent_tasks SET status = ?, started_at = ? WHERE id = ?').run('running', now, task.id)

  try {
    if (task.type === 'extract_profile') {
      const payload = JSON.parse(task.payload) as ExtractProfilePayload
      const extracted = await extractProfileFromConversation(payload.userMessage, payload.assistantMessage)
      if (extracted && Object.keys(extracted).length > 0) {
        mergeProfile(extracted)
      }
    }

    db.prepare('UPDATE agent_tasks SET status = ?, finished_at = ? WHERE id = ?').run('done', new Date().toISOString(), task.id)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    db.prepare('UPDATE agent_tasks SET status = ?, error = ?, finished_at = ? WHERE id = ?').run('failed', errMsg, new Date().toISOString(), task.id)
    console.warn('[agent] task failed:', task.id, errMsg)
  }
}

/** 检查并处理 pending 任务 */
async function tick() {
  const tasks = db.prepare(
    'SELECT id, type, payload FROM agent_tasks WHERE status = ? ORDER BY id ASC LIMIT 5'
  ).all('pending') as { id: number; type: string; payload: string }[]

  for (const task of tasks) {
    await processTask(task)
  }
}

/** 启动 Worker，每 30 秒 tick 一次 */
export function startAgentWorker() {
  console.log('[agent] Worker started')
  // 立即跑一次（处理服务重启前未完成的任务）
  tick().catch(e => console.warn('[agent] initial tick error:', e))
  setInterval(() => {
    tick().catch(e => console.warn('[agent] tick error:', e))
  }, 30_000)
}

/** 向队列写入任务（前端通过 /api/memory/queue POST 调用，或 server 内部直接调用） */
export function enqueueTask(type: string, payload: Record<string, unknown>) {
  db.prepare(
    'INSERT INTO agent_tasks (type, payload, status, created_at) VALUES (?, ?, ?, ?)'
  ).run(type, JSON.stringify(payload), 'pending', new Date().toISOString())
}
