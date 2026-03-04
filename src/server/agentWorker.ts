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

interface ExtractPreferencePayload {
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
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.2
      })
    })
    if (!resp.ok) return
    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return
    const parsed = JSON.parse(jsonMatch[0]) as { preference?: string }
    if (!parsed.preference?.trim()) return

    // 写入 profile.rules（追加到 JSON 数组）
    const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('preference_rules') as { value: string } | undefined
    const rules: Array<{ trigger: string; preference: string; confidence: number; updatedAt: string }> =
      existing?.value ? JSON.parse(existing.value) : []

    const today = new Date().toISOString().split('T')[0]
    const newRule = { trigger: userMessage.slice(0, 40), preference: parsed.preference, confidence: 0.7, updatedAt: today }
    // 简单去重：preference 相似时跳过
    if (rules.some(r => r.preference === parsed.preference)) return

    rules.push(newRule)
    const val = JSON.stringify(rules)
    if (existing) {
      db.prepare('UPDATE config SET value = ? WHERE key = ?').run(val, 'preference_rules')
    } else {
      db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('preference_rules', val)
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
    } else if (task.type === 'extract_preference') {
      const payload = JSON.parse(task.payload) as ExtractPreferencePayload
      await extractPreferenceFromFeedback(payload.userMessage, payload.assistantMessage)
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
