/**
 * Agent Tasks — AI 后台任务实现
 *
 * 所有具体的 AI 任务函数。由 agentWorker.ts 的 processTask 调用。
 *
 * 任务类型：
 *   - consolidateFacts:     合并语义重叠的记忆条目
 *   - extractLogicalEdges:  提取对话节点间的逻辑关系
 *   - extractProfile:       从对话中提取用户画像增量
 *   - extractPreference:    从用户反馈中提取偏好规则
 *   - embedFile:            对上传文件分块并生成 embedding
 */

import type Database from 'better-sqlite3'
import type { AIMessage, Conversation } from '../shared/types'
import { AI_CONFIG, DEFAULT_SYSTEM_PROMPT, ONBOARDING_SYSTEM_PROMPT } from '../shared/constants'
import { cosineSim, embedTextWithUserKey } from './lib/embedding'

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

interface ExtractLogicalEdgesPayload {
  conversationId: string
  userMessage: string
  assistantMessage: string
  candidateNodes: Array<{ conversationId: string; title: string; userMessage: string; score: number }>
}

interface DeepSearchPayload {
  conversationId: string
  messages: AIMessage[]
  preferences?: string[]
  compressedMemory?: string
  isOnboarding?: boolean
  systemPromptOverride?: string
}

/** 把现有 facts 传给 LLM，合并语义重叠条目，软删除旧条目，写入合并后的新条目 */
async function consolidateFacts(db: InstanceType<typeof Database>): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig(db)
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
    // 安全底线：合并后不能少于原来的 30%，防止模型意外删除几乎所有记忆
    if (cleaned.length < Math.max(1, Math.floor(rows.length * 0.3))) return

    const now = new Date().toISOString()
    // 在事务中：软失效所有旧条目（保留历史轨迹），写入合并后的新条目
    const softInvalidate = db.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?')
    const insert = db.prepare(
      "INSERT INTO memory_facts (id, fact, source_conv_id, created_at, type) VALUES (lower(hex(randomblob(16))), ?, 'consolidated', ?, 'semantic')"
    )
    db.transaction(() => {
      for (const row of rows) softInvalidate.run(now, row.id)
      for (const fact of cleaned) insert.run(fact, now)
    })()

    console.log(`[agent] consolidate_facts: ${rows.length} → ${cleaned.length} facts`)
  } catch (e) {
    console.warn('[agent] consolidateFacts failed:', e)
  }
}

/** AI 提取两个节点之间的显式逻辑关系，写入 logical_edges 表 */
async function extractLogicalEdges(
  db: InstanceType<typeof Database>,
  payload: ExtractLogicalEdgesPayload
): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig(db)
  if (!apiKey) return

  const { conversationId, userMessage, assistantMessage, candidateNodes } = payload
  if (candidateNodes.length === 0) return

  const candidatesText = candidateNodes.map((n, i) =>
    `${i + 1}. 标题：${n.title}\n   内容摘要：${n.userMessage.slice(0, 120)}`
  ).join('\n\n')

  const prompt = `你正在分析一个用户的思维图谱。

【当前对话】
用户问：${userMessage.slice(0, 200)}
AI 答：${assistantMessage.slice(0, 200)}

【候选关联节点】
${candidatesText}

任务：判断当前对话与上述每个候选节点之间是否存在明确的逻辑关系。

关系类型定义：
- 深化了：当前对话对候选节点的问题进行了更深入的探讨
- 解决了：当前对话回答或解决了候选节点中提出的问题
- 矛盾于：当前对话的观点或结论与候选节点相反
- 依赖于：理解当前对话需要先理解候选节点
- 启发了：候选节点的内容启发或引导了当前对话
- 重新思考了：当前对话修正或推翻了候选节点的结论

仅在关系明确（置信度 >= 0.7）时输出。相似主题但无明确逻辑关系的不输出。

严格按 JSON 数组输出，不要有任何其他文字：
[
  {"index": 1, "relation": "解决了", "reason": "当前对话直接回答了候选节点中关于XX的疑问", "confidence": 0.85},
  {"index": 2, "relation": "深化了", "reason": "当前对话在候选节点的基础上进一步探讨了YY", "confidence": 0.75}
]

如果没有明确关系，输出空数组：[]`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(15_000)
    })

    if (!resp.ok) return

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''

    // 提取 JSON（容错：去掉 markdown 代码块包裹）
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let results: Array<{ index: number; relation: string; reason: string; confidence: number }> = []
    try { results = JSON.parse(jsonStr) } catch { return }

    const now = new Date().toISOString()
    for (const r of results) {
      const candidate = candidateNodes[r.index - 1]
      if (!candidate) continue
      if (r.confidence < 0.7) continue

      // 去重：同一对之间同一关系类型只存一条
      const existing = db.prepare(
        'SELECT id FROM logical_edges WHERE source_conv = ? AND target_conv = ? AND relation = ?'
      ).get(conversationId, candidate.conversationId, r.relation)
      if (existing) continue

      const edgeId = `ledge-${conversationId}-${candidate.conversationId}-${Date.now()}`
      db.prepare(`
        INSERT INTO logical_edges (id, source_conv, target_conv, relation, reason, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(edgeId, conversationId, candidate.conversationId, r.relation, r.reason, r.confidence, now)

      console.log(`[agent] logical edge: ${r.relation} (${r.confidence}) → ${candidate.title.slice(0, 20)}`)
    }
  } catch (e) {
    console.warn('[agent] extractLogicalEdges failed:', e)
  }
}

/** 从 config 表读取 apiKey / baseUrl（使用指定用户的 db）；若用户未配置 key，fallback 到 SHARED_API_KEY */
function getApiConfig(db: InstanceType<typeof Database>): { apiKey: string; baseUrl: string; model: string } {
  const keyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as { value: string } | undefined
  const urlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as { value: string } | undefined
  const userKey = keyRow?.value ?? ''
  const sharedKey = process.env.SHARED_API_KEY ?? ''
  const baseUrl = (urlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')
  // 画像提取始终用最便宜模型，不受用户主模型配置影响；根据 provider 选择合适的 fast model
  const isMoonshot = baseUrl.includes('moonshot')
  const isOpenAI = baseUrl.includes('openai.com')
  const model = isMoonshot ? 'moonshot-v1-8k' : isOpenAI ? 'gpt-4o-mini' : 'moonshot-v1-8k'
  return {
    apiKey: userKey || sharedKey,
    baseUrl,
    model
  }
}

/** deep search 使用用户配置的主模型（可更强），fallback 到默认 */
function getChatModel(db: InstanceType<typeof Database>, baseUrl: string): string {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get('model') as { value: string } | undefined
    const configured = (row?.value ?? '').trim()
    if (configured) return configured
  } catch { /* ignore */ }
  // 保底：按 provider 兜底
  const isMoonshot = baseUrl.includes('moonshot')
  const isOpenAI = baseUrl.includes('openai.com')
  return isOpenAI ? 'gpt-4o-mini' : (isMoonshot ? 'kimi-k2.5' : AI_CONFIG.MODEL)
}

function formatToday(): string {
  try {
    return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function safeTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = (content as any[]).find(c => c?.type === 'text')?.text
    return typeof t === 'string' ? t : ''
  }
  return ''
}

function searchMemoryFactsFts(db: InstanceType<typeof Database>, query: string, limit = 8): string[] {
  const q = query.trim()
  if (!q) return []
  // FTS5 query：用空格分词，避免特殊字符报错（过长也截断）
  const cleaned = q
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
  if (!cleaned) return []
  try {
    // memory_facts_fts 的触发器会在 invalid_at 设置后删除对应条目，因此这里只查 FTS 即可
    const rows = db.prepare(
      'SELECT fact FROM memory_facts_fts WHERE fact MATCH ? LIMIT ?'
    ).all(cleaned, limit) as { fact: string }[]
    return rows.map(r => r.fact).filter(Boolean)
  } catch {
    // fallback：最近 N 条（避免工具返回空导致模型死循环）
    try {
      const rows = db.prepare(
        'SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT ?'
      ).all(limit) as { fact: string }[]
      return rows.map(r => r.fact).filter(Boolean)
    } catch {
      return []
    }
  }
}

async function searchFileChunks(
  db: InstanceType<typeof Database>,
  query: string,
  apiKey: string,
  baseUrl: string
): Promise<Array<{ filename: string; chunkIndex: number; chunkText: string; score: number }>> {
  try {
    const queryF32 = await embedTextWithUserKey(query, apiKey, baseUrl, { maxInputLen: 1000, timeoutMs: 12_000 })
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
        const copied = row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)
        const vec = new Float32Array(copied)
        const score = cosineSim(queryF32, vec)
        return { filename: row.filename, chunkIndex: row.chunk_index, chunkText: row.chunk_text, score }
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  } catch {
    return []
  }
}

async function runWebSearch(query: string): Promise<string | null> {
  const cleaned = query.trim().slice(0, 200)
  if (!cleaned) return null
  try {
    const resp = await fetch(`https://s.jina.ai/${encodeURIComponent(cleaned)}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(12_000)
    })
    if (!resp.ok) return null
    const text = await resp.text()
    return text.slice(0, 4000)
  } catch {
    return null
  }
}

function upsertConversationLine(db: InstanceType<typeof Database>, conversation: Conversation) {
  const now = new Date().toISOString()
  const line = JSON.stringify(conversation)
  db.prepare(`
    INSERT INTO storage (filename, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET
      content = storage.content || CASE WHEN storage.content = '' THEN '' ELSE char(10) END || excluded.content,
      updated_at = excluded.updated_at
  `).run('conversations.jsonl', line, now)
}

function loadLatestConversation(db: InstanceType<typeof Database>, conversationId: string): Conversation | null {
  try {
    const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as { content: string } | undefined
    const content = row?.content ?? ''
    if (!content.trim()) return null
    const lines = content.trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const conv = JSON.parse(lines[i]) as Conversation
        if (conv.id === conversationId) return conv
      } catch { /* ignore */ }
    }
    return null
  } catch {
    return null
  }
}

function saveConversationHistory(db: InstanceType<typeof Database>, conversationId: string, messages: AIMessage[]) {
  const trimmed = messages.slice(-100)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO conversation_history (conversation_id, messages, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
  `).run(conversationId, JSON.stringify(trimmed), now)
}

/**
 * Deep Search — 后台长任务：
 * - 支持工具调用（search_memory / search_files / $web_search）
 * - 支持多轮（最多 5 轮），并把进度写入 agent_tasks.progress
 * - 最终把答案写回 conversations.jsonl（同 id 追加覆盖）+ conversation_history
 */
export async function deepSearchAnswer(
  db: InstanceType<typeof Database>,
  taskId: number,
  rawPayload: Record<string, unknown>
): Promise<void> {
  const payload = rawPayload as Partial<DeepSearchPayload>
  const conversationId = (payload.conversationId ?? '').trim()
  const messages = Array.isArray(payload.messages) ? (payload.messages as AIMessage[]) : []
  if (!conversationId || messages.length === 0) return

  const setProgress = (msg: string) => {
    try { db.prepare('UPDATE agent_tasks SET progress = ? WHERE id = ?').run(msg, taskId) } catch { /* ignore */ }
  }
  const setResult = (result: unknown) => {
    try { db.prepare('UPDATE agent_tasks SET result = ? WHERE id = ?').run(JSON.stringify(result), taskId) } catch { /* ignore */ }
  }

  const { apiKey, baseUrl } = getApiConfig(db)
  if (!apiKey) {
    setProgress('缺少可用的 API Key，已跳过深度搜索。')
    return
  }

  const model = getChatModel(db, baseUrl)
  const today = formatToday()
  const systemPrompt = payload.systemPromptOverride
    ? String(payload.systemPromptOverride).replace('{{DATE}}', today)
    : (payload.isOnboarding ? ONBOARDING_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT).replace('{{DATE}}', today)

  const prefs = Array.isArray(payload.preferences) ? payload.preferences.filter(Boolean).slice(0, 20) : []
  const prefBlock = prefs.length > 0
    ? `\n\n【用户偏好（需要遵守）】\n${prefs.map((p, i) => `${i + 1}. ${String(p).trim()}`).join('\n')}\n`
    : ''
  const memoryBlock = payload.compressedMemory?.trim()
    ? `\n\n【相关记忆片段】\n${payload.compressedMemory.trim().slice(0, 6000)}\n`
    : ''

  const fullMessages: AIMessage[] = [
    { role: 'system', content: systemPrompt + prefBlock + memoryBlock },
    ...messages
  ]

  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'search_memory',
        description: '查询用户的个人记忆库（memory_facts），用于补充回答所需的用户历史事实',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: '在用户上传的文件中语义搜索相关内容片段',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: '$web_search',
        description: '联网搜索（返回文本摘要）',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    }
  ]

  const callLLM = async (msgs: AIMessage[]) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4 * 60_000) // 单次请求最多 4 分钟，避免永久挂住
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: msgs,
          tools,
          temperature: AI_CONFIG.TEMPERATURE,
          max_tokens: AI_CONFIG.MAX_TOKENS,
          stream: false
        }),
        signal: controller.signal
      })
      if (!resp.ok) return { ok: false as const, status: resp.status, text: await resp.text() }
      const data = await resp.json() as any
      return { ok: true as const, data }
    } finally {
      clearTimeout(timeout)
    }
  }

  setProgress('深度搜索已开始（可关闭窗口，后台继续）。')

  const MAX_ROUNDS = 5
  let current = [...fullMessages]
  let finalContent = ''
  let finalReasoning = ''

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    setProgress(`深度搜索进行中：第 ${round}/${MAX_ROUNDS} 轮…`)
    const res = await callLLM(current)
    if (!res.ok) {
      setProgress(`深度搜索失败（上游错误 ${res.status}），将输出已有内容。`)
      break
    }
    const choice = res.data?.choices?.[0]
    const msg = choice?.message ?? {}
    const content = String(msg?.content ?? '')
    const reasoning = String(msg?.reasoning_content ?? '')
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
    const finishReason = choice?.finish_reason ?? null

    if (content) finalContent += content
    if (reasoning) finalReasoning += reasoning

    if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
      if (!finalContent && content) finalContent = content
      break
    }

    // 生成 assistant tool_calls 消息
    current.push({
      role: 'assistant',
      content: content || '',
      reasoning_content: reasoning || undefined,
      tool_calls: toolCalls
    } as any)

    // 执行工具并回填 tool messages
    const toolMsgs: AIMessage[] = []
    for (const tc of toolCalls) {
      const name = tc?.function?.name ?? ''
      const id = tc?.id ?? ''
      const argsRaw = tc?.function?.arguments ?? '{}'
      let query = ''
      try {
        const parsed = JSON.parse(argsRaw) as any
        query = String(parsed?.query ?? parsed?.q ?? parsed?.keyword ?? parsed?.keywords ?? '').trim()
      } catch { /* ignore */ }

      if (name === 'search_memory') {
        setProgress('深度搜索：正在查询记忆库…')
        const facts = searchMemoryFactsFts(db, query, 10)
        const result = facts.length > 0 ? facts.map((f, i) => `${i + 1}. ${f}`).join('\n') : '未找到相关记忆。'
        toolMsgs.push({ role: 'tool', tool_call_id: id, content: result })
      } else if (name === 'search_files') {
        setProgress('深度搜索：正在检索文件内容…')
        const chunks = query ? await searchFileChunks(db, query, apiKey, baseUrl) : []
        const result = chunks.length > 0
          ? chunks.map((c, i) => `[${i + 1}] 文件《${c.filename}》第${c.chunkIndex + 1}段：\n${c.chunkText}`).join('\n\n')
          : '未找到相关文件内容。'
        toolMsgs.push({ role: 'tool', tool_call_id: id, content: result })
      } else if (name === '$web_search' || name === 'web_search') {
        setProgress('深度搜索：正在联网检索…')
        const fetched = query ? await runWebSearch(query) : null
        toolMsgs.push({ role: 'tool', tool_call_id: id, content: fetched || '网页搜索暂时无结果。' })
      } else {
        toolMsgs.push({ role: 'tool', tool_call_id: id, content: '未知工具调用，已跳过。' })
      }
    }
    current.push(...toolMsgs)
  }

  const answer = finalContent.trim()
  setResult({ content: answer, reasoning: finalReasoning || null })
  setProgress(answer ? '深度搜索已完成。' : '深度搜索已完成，但未生成正文输出。')

  // 写回对话（覆盖同 id 的最新记录）
  const existing = loadLatestConversation(db, conversationId)
  const lastUser = safeTextFromContent(messages.filter(m => m.role === 'user').slice(-1)[0]?.content)
  const base: Conversation = existing ?? {
    id: conversationId,
    createdAt: new Date().toISOString(),
    userMessage: lastUser || '',
    assistantMessage: '',
  }
  const updated: Conversation = {
    ...base,
    assistantMessage: answer || base.assistantMessage || '[无回复]',
    reasoning_content: finalReasoning || base.reasoning_content,
    // 标记深度搜索完成（前端用它来展示“已完成”提示）
    deepSearch: {
      taskId,
      status: 'done',
      finishedAt: new Date().toISOString(),
    } as any
  } as any
  upsertConversationLine(db, updated)

  // 同步 conversation_history，保证后续连续对话上下文可用
  const historyToSave: AIMessage[] = [
    ...messages,
    { role: 'assistant', content: updated.assistantMessage, reasoning_content: finalReasoning || undefined }
  ]
  saveConversationHistory(db, conversationId, historyToSave)
}

/** AI 提取画像增量，返回 partial UserProfile JSON */
async function extractProfileFromConversation(
  db: InstanceType<typeof Database>,
  userMessage: string,
  _assistantMessage: string
): Promise<Record<string, unknown> | null> {
  const { apiKey, baseUrl, model } = getApiConfig(db)
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
  "goals": ["当前目标——必须带场景和状态，如'正在做 GEO 小工具，处于早期探索阶段，想找到变现路径'，而不是'目标是变现'"],
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
  db: InstanceType<typeof Database>,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig(db)
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


function mergeProfile(db: InstanceType<typeof Database>, extracted: Record<string, unknown>) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined

  const mergeArr = (existing: string | null, incoming: unknown): string | null => {
    if (!incoming || !Array.isArray(incoming)) return existing
    let base: string[] = []
    if (existing) { try { base = JSON.parse(existing) } catch { base = [] } }
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

// 内置 embedding 配置（阿里云，不依赖用户配置）
const BUILTIN_EMBED_WORKER = {
  apiKey: process.env.BUILTIN_EMBED_API_KEY ?? '',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'text-embedding-v4'
}
let builtinEmbedWorkerFailed = false

const MULTIMODAL_EMBED_WORKER = {
  apiKey: process.env.BUILTIN_EMBED_API_KEY ?? '',
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding',
  model: 'qwen3-vl-embedding'
}

/** 对图片文件做多模态 embedding（图片 URL + 可选描述文字） */
async function embedImageFile(
  db: InstanceType<typeof Database>,
  fileId: string,
  filename: string,
  textContent: string  // 可能包含 OCR 文字或描述
): Promise<void> {
  // 从 DB 读取图片的 base64 内容
  const fileRow = db.prepare('SELECT content, mimetype FROM uploaded_files WHERE id = ?').get(fileId) as
    { content: Buffer; mimetype: string } | undefined
  if (!fileRow?.content) return

  const base64 = fileRow.content.toString('base64')
  const dataUrl = `data:${fileRow.mimetype};base64,${base64}`

  const contents: Array<{ text?: string; image?: string }> = [{ image: dataUrl }]
  if (textContent.trim().length > 0) {
    contents.push({ text: textContent.slice(0, 500) })
  }

  try {
    const resp = await fetch(
      `${MULTIMODAL_EMBED_WORKER.baseUrl}/multimodal-embedding`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MULTIMODAL_EMBED_WORKER.apiKey}`,
          'X-DashScope-DataInspection': 'enable'
        },
        body: JSON.stringify({
          model: MULTIMODAL_EMBED_WORKER.model,
          input: { contents },
          parameters: { dimension: 1024 }
        }),
        signal: AbortSignal.timeout(20_000)
      }
    )
    if (!resp.ok) {
      console.warn(`[agent] image embed failed for ${filename}:`, resp.status)
      db.prepare("UPDATE uploaded_files SET embed_status = 'text_only' WHERE id = ?").run(fileId)
      return
    }
    const data = (await resp.json()) as { output?: { embeddings?: Array<{ embedding: number[] }> } }
    const vec = data?.output?.embeddings?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length === 0) {
      db.prepare("UPDATE uploaded_files SET embed_status = 'text_only' WHERE id = ?").run(fileId)
      return
    }
    const f32 = new Float32Array(vec)
    const vecBuf = Buffer.from(f32.buffer)
    const chunkId = `${fileId}-chunk-0`
    db.prepare(`
      INSERT OR REPLACE INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(chunkId, fileId, 0, textContent.slice(0, 200) || filename, vecBuf, vec.length, new Date().toISOString())
    db.prepare('UPDATE uploaded_files SET embed_status = ?, chunk_count = ? WHERE id = ?').run('done', 1, fileId)
    console.log(`[agent] image embed ${filename}: multimodal vector dim=${vec.length}`)
  } catch (e) {
    console.warn(`[agent] image embed error for ${filename}:`, e)
    db.prepare("UPDATE uploaded_files SET embed_status = 'text_only' WHERE id = ?").run(fileId)
  }
}

/** 对文件内容分块并生成 embedding，写入 file_embeddings 表 */
async function embedFileContent(
  db: InstanceType<typeof Database>,
  fileId: string,
  textContent: string,
  filename: string
): Promise<void> {
  if (builtinEmbedWorkerFailed) {
    db.prepare("UPDATE uploaded_files SET embed_status = 'text_only' WHERE id = ?").run(fileId)
    return
  }

  // 图片文件走多模态 embedding（base64 直接传入）
  const mimeRow = db.prepare('SELECT mimetype FROM uploaded_files WHERE id = ?').get(fileId) as { mimetype: string } | undefined
  if (mimeRow?.mimetype?.startsWith('image/')) {
    await embedImageFile(db, fileId, filename, textContent)
    return
  }

  const chunks = splitTextIntoChunks(textContent)
  let embeddedCount = 0

  // 清除旧的分块（重新嵌入时先删除）
  db.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run(fileId)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const resp = await fetch(`${BUILTIN_EMBED_WORKER.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BUILTIN_EMBED_WORKER.apiKey}` },
        body: JSON.stringify({ model: BUILTIN_EMBED_WORKER.model, input: chunk, dimensions: 2048 }),
        signal: AbortSignal.timeout(15_000)
      })

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          builtinEmbedWorkerFailed = true
          console.error('[agent] BUILTIN embedding key invalid, disabling file embedding')
          db.prepare("UPDATE uploaded_files SET embed_status = 'text_only' WHERE id = ?").run(fileId)
          return
        }
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

/** 更新文件状态：有向量 → done；无向量 → text_only（文本可读，不报错） */
  const status = embeddedCount > 0 ? 'done' : 'text_only'
  db.prepare('UPDATE uploaded_files SET embed_status = ?, chunk_count = ? WHERE id = ?').run(status, embeddedCount, fileId)
  console.log(`[agent] embed_file ${filename}: ${embeddedCount}/${chunks.length} chunks embedded, status=${status}`)
}

/** 每个用户 db 每 24 小时执行一次偏好衰减（降低30天未更新的 rule 置信度） */
function maybeDecayPreferences(db: InstanceType<typeof Database>) {
  const lastDecayRow = db.prepare("SELECT value FROM config WHERE key = 'last_pref_decay'").get() as { value: string } | undefined
  const lastDecay = lastDecayRow ? new Date(lastDecayRow.value).getTime() : 0
  if (Date.now() - lastDecay < 24 * 60 * 60 * 1000) return

  // 操作 config.preference_rules，与 ai.ts 的读取路径一致
  const rulesRow = db.prepare("SELECT value, updated_at FROM config WHERE key = 'preference_rules'").get() as { value: string; updated_at: string } | undefined
  if (!rulesRow?.value) return
  try {
    const rules = JSON.parse(rulesRow.value) as Array<{ confidence: number; updatedAt: string; [k: string]: unknown }>
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const updated = rules.map(r =>
      r.updatedAt < thirtyDaysAgo
        ? { ...r, confidence: Math.max(0.3, r.confidence - 0.05) }
        : r
    )
    const nowTs = new Date().toISOString()
    db.prepare("UPDATE config SET value = ?, updated_at = ? WHERE key = 'preference_rules'")
      .run(JSON.stringify(updated), nowTs)
    db.prepare("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('last_pref_decay', ?, ?)")
      .run(nowTs, nowTs)
  } catch { /* 静默 */ }
}

/**
 * B1 — 从碎片化的 memory_facts 提炼结构化 User Mental Model
 *
 * model_json 格式：
 * {
 *   "认知框架": ["第一性原理思维", "结构化表达偏好"],
 *   "长期目标": ["2026年做出SaaS产品"],
 *   "思维偏好": ["不喜欢废话", "要先给结论"],
 *   "领域知识": { "AI产品": "专家", "前端": "中级" },
 *   "情绪模式": ["压力时倾向简短确认"]
 * }
 */
export async function extractMentalModel(db: InstanceType<typeof Database>): Promise<void> {
  const { apiKey, baseUrl, model } = getApiConfig(db)
  if (!apiKey) return

  // 收集素材：最新 60 条有效 facts + user_profile 字段
  const factRows = db.prepare(
    'SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 60'
  ).all() as { fact: string }[]
  if (factRows.length < 3) return  // 太少无法推断

  const profile = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined

  const factsText = factRows.map((r, i) => `${i + 1}. ${r.fact}`).join('\n')
  const profileParts: string[] = []
  if (profile?.occupation) profileParts.push(`职业：${profile.occupation}`)
  if (profile?.goals) {
    try { profileParts.push(`目标：${(JSON.parse(profile.goals) as string[]).join('、')}`) } catch {}
  }
  if (profile?.interests) {
    try { profileParts.push(`兴趣：${(JSON.parse(profile.interests) as string[]).join('、')}`) } catch {}
  }

  const prompt = `你是用户认知模型提炼器。根据以下关于同一用户的记忆片段，提炼出结构化的用户心智模型。

${profileParts.length > 0 ? `【用户基本信息】\n${profileParts.join('\n')}\n\n` : ''}【记忆片段】
${factsText}

提炼规则：
1. 只从已有信息中归纳，不推测或捏造
2. 每项最多 5 条，每条不超过 20 字
3. "领域知识"只在有明确证据时才填写
4. 没有证据的字段输出空数组

严格按以下 JSON 格式输出，不要其他文字：
{
  "认知框架": ["思维方式或认知习惯"],
  "长期目标": ["用户的长期目标或追求"],
  "思维偏好": ["用户对信息呈现方式的偏好"],
  "领域知识": {"领域名": "初级/中级/专家"},
  "情绪模式": ["用户在特定情境下的情绪反应模式"]
}`

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(20_000)
    })
    if (!resp.ok) return

    const data = (await resp.json()) as { choices: { message: { content: string } }[] }
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    // 字段类型校验：关键数组字段必须为数组，领域知识必须为对象
    const expectedKeys = ['认知框架', '长期目标', '思维偏好', '领域知识', '情绪模式']
    const hasExpectedKey = expectedKeys.some(k => k in parsed)
    if (!hasExpectedKey) return
    const arrayFields = ['认知框架', '长期目标', '思维偏好', '情绪模式']
    for (const f of arrayFields) {
      if (f in parsed && !Array.isArray(parsed[f])) return  // LLM 返回了错误类型
    }
    if ('领域知识' in parsed && (typeof parsed['领域知识'] !== 'object' || Array.isArray(parsed['领域知识']) || parsed['领域知识'] === null)) return

    // 只保留已知字段，防止 LLM 额外字段污染存储
    const sanitized: Record<string, unknown> = {}
    for (const k of expectedKeys) {
      if (k in parsed) sanitized[k] = parsed[k]
    }
    const now = new Date().toISOString()
    const modelJson = JSON.stringify(sanitized)

    const existing = db.prepare('SELECT id FROM user_mental_model WHERE id = 1').get()
    if (existing) {
      db.prepare('UPDATE user_mental_model SET model_json = ?, updated_at = ? WHERE id = 1').run(modelJson, now)
    } else {
      db.prepare('INSERT INTO user_mental_model (id, model_json, updated_at) VALUES (1, ?, ?)').run(modelJson, now)
    }
    console.log(`[agent] extract_mental_model: model updated (${factRows.length} facts → structured model)`)
  } catch (e) {
    console.warn('[agent] extractMentalModel failed:', e)
  }
}

export {
  consolidateFacts,
  extractLogicalEdges,
  getApiConfig,
  extractProfileFromConversation,
  extractPreferenceFromFeedback,
  mergeProfile,
  splitTextIntoChunks,
  embedFileContent,
  maybeDecayPreferences,
}

export type { ExtractProfilePayload, ExtractPreferencePayload, EmbedFilePayload, ExtractLogicalEdgesPayload }
