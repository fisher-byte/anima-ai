/**
 * Storage routes
 *
 * 静态路由必须在 /:filename 通配路由之前注册，否则会被拦截。
 *
 * POST /api/storage/file               → 上传二进制文件 (multipart/form-data)
 * GET  /api/storage/file/:id           → 下载二进制文件
 * GET  /api/storage/files              → 列出已上传文件（元数据，不含内容）
 * DELETE /api/storage/file/:id         → 删除文件及其分块向量
 * GET  /api/storage/export             → 导出全量数据 (JSON)
 * GET  /api/storage/:filename          → 读取文件内容
 * PUT  /api/storage/:filename          → 写入文件内容 (raw text body)
 * POST /api/storage/:filename/append   → 追加一行 (raw text body)
 */

import { Hono } from 'hono'
import type Database from 'better-sqlite3'
import { isValidFilename } from '../../shared/constants'
import { enqueueTask } from '../agentWorker'

export const storageRoutes = new Hono()

/** Get the per-user database from request context */
function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

// 文件大小上限：50 MB（二进制上传）
const MAX_FILE_SIZE = 50 * 1024 * 1024
// 文本存储上限：10 MB（PUT /:filename 纯文本，防止 DoS）
const MAX_TEXT_SIZE = 10 * 1024 * 1024
// 追加行上限：1 MB（POST /:filename/append，防止单行过大）
const MAX_APPEND_SIZE = 1 * 1024 * 1024
// tailLines 上限（GET /:filename?tailLines=N），避免极端值
const MAX_TAIL_LINES = 20000

function tailTextByLines(content: string, lines: number): string {
  if (lines <= 0) return ''
  if (!content.includes('\n')) return content

  let count = 0
  let i = content.length - 1
  // Skip trailing newlines
  while (i >= 0 && content[i] === '\n') i--
  for (; i >= 0; i--) {
    if (content[i] === '\n') {
      count++
      if (count >= lines) {
        return content.slice(i + 1)
      }
    }
  }
  return content
}

// 允许的 MIME 类型白名单（魔数校验的辅助）
const ALLOWED_MIME_PREFIXES = [
  'image/', 'text/', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/json', 'application/xml',
  'application/octet-stream'
]

// 魔数签名映射（前 8 字节 hex → 允许的 MIME 前缀）
const MAGIC_BYTES: Array<{ hex: string; mime: string }> = [
  { hex: '25504446', mime: 'application/pdf' },   // %PDF
  { hex: '89504e47', mime: 'image/png' },          // PNG
  { hex: 'ffd8ff', mime: 'image/jpeg' },           // JPEG
  { hex: '47494638', mime: 'image/gif' },          // GIF
  { hex: '52494646', mime: 'image/webp' },         // RIFF (WebP)
  { hex: '504b0304', mime: 'application/vnd.openxmlformats-officedocument' }, // ZIP/DOCX/XLSX
  { hex: 'd0cf11e0', mime: 'application/msword' } // OLE2 (DOC/XLS)
]

/** 魔数校验：文本文件和代码文件不在白名单时跳过校验，直接允许 */
function isContentSafe(buffer: Buffer, declaredMime: string): boolean {
  // 文本类型不需要魔数校验
  if (declaredMime.startsWith('text/') || declaredMime === 'application/json' ||
      declaredMime === 'application/xml' || declaredMime === 'application/octet-stream') return true

  const hexHead = buffer.slice(0, 8).toString('hex').toLowerCase()
  const matched = MAGIC_BYTES.find(m => hexHead.startsWith(m.hex))
  if (!matched) return true  // 未知格式允许通过（私有格式不在白名单）
  // 魔数已知时，验证与声明的 MIME 一致
  return declaredMime.startsWith(matched.mime)
}

// POST /api/storage/file — 上传二进制文件（multipart/form-data）
storageRoutes.post('/file', async (c) => {
  const db = userDb(c)
  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined
  if (!file) return c.json({ error: 'file required' }, 400)

  // 文件大小检查
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `文件过大，最大支持 50MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）` }, 413)
  }

  // MIME 类型白名单粗筛
  const declaredMime = file.type || 'application/octet-stream'
  const allowed = ALLOWED_MIME_PREFIXES.some(p => declaredMime.startsWith(p))
  if (!allowed) {
    return c.json({ error: `不支持的文件类型：${declaredMime}` }, 415)
  }

  const id = (body['id'] as string) || crypto.randomUUID()
  const textContent = (body['textContent'] as string) || ''
  const convId = (body['convId'] as string) || null
  const now = new Date().toISOString()

  const buffer = Buffer.from(await file.arrayBuffer())

  // 魔数校验
  if (!isContentSafe(buffer, declaredMime)) {
    return c.json({ error: '文件内容与声明类型不匹配' }, 415)
  }

  db.prepare(`
    INSERT OR REPLACE INTO uploaded_files (id, filename, mimetype, size, content, text_content, conv_id, chunk_count, embed_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?)
  `).run(id, file.name, declaredMime, buffer.length, buffer, textContent || null, convId, now)

  // 将 embedding 任务排入 Agent 队列（分块处理，不阻塞上传响应）
  if (textContent.trim().length > 10) {
    enqueueTask(db, 'embed_file', { fileId: id, textContent, filename: file.name })
  } else {
    // 无文本内容（如图片），直接标记完成
    db.prepare("UPDATE uploaded_files SET embed_status = 'done' WHERE id = ?").run(id)
  }

  return c.json({ ok: true, fileId: id, filename: file.name, size: buffer.length })
})

// GET /api/storage/file/:id — 下载二进制文件
storageRoutes.get('/file/:id', (c) => {
  const db = userDb(c)
  const { id } = c.req.param()
  const row = db.prepare('SELECT filename, mimetype, content FROM uploaded_files WHERE id = ?').get(id) as
    { filename: string; mimetype: string; content: Buffer } | undefined

  if (!row || !row.content) return c.json({ error: 'not found' }, 404)

  const safeFilename = encodeURIComponent(row.filename.replace(/[^\w.\-]/g, '_'))
  // ASCII fallback（兼容旧版客户端）+ RFC 5987 encoded filename
  const asciiFallback = row.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return new Response(new Uint8Array(row.content), {
    status: 200,
    headers: {
      'Content-Type': row.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${safeFilename}`
    }
  })
})

// GET /api/storage/files — 列出已上传文件（只返回元数据，不含二进制内容）
storageRoutes.get('/files', (c) => {
  const db = userDb(c)
  const rows = db.prepare(
    'SELECT id, filename, mimetype, size, conv_id, chunk_count, embed_status, created_at FROM uploaded_files ORDER BY created_at DESC LIMIT 200'
  ).all() as { id: string; filename: string; mimetype: string; size: number; conv_id: string | null; chunk_count: number; embed_status: string; created_at: string }[]
  return c.json({ files: rows })
})

// DELETE /api/storage/file/:id — 删除文件及其分块向量
storageRoutes.delete('/file/:id', (c) => {
  const db = userDb(c)
  const { id } = c.req.param()
  db.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run(id)
  db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(id)
  return c.json({ ok: true })
})

// GET /api/storage/export — 导出所有数据（对话 / 节点 / 记忆 / 进化基因 / 文件元数据）
storageRoutes.get('/export', (c) => {
  const db = userDb(c)
  const getFile = (filename: string): string | null => {
    const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as
      { content: string } | undefined
    return row?.content ?? null
  }

  const conversationsRaw = getFile('conversations.jsonl')
  const nodesRaw = getFile('nodes.json')
  const profileRaw = getFile('profile.json')

  const conversations = conversationsRaw
    ? conversationsRaw.trim().split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    : []

  let nodes: unknown[] = []
  try { nodes = nodesRaw ? JSON.parse(nodesRaw) : [] } catch {}

  let profile: unknown = {}
  try { profile = profileRaw ? JSON.parse(profileRaw) : {} } catch {}

  const memoryFacts = db.prepare(
    'SELECT id, fact, source_conv_id, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC'
  ).all()

  // 导出文件元数据（不含二进制内容，避免导出包过大）
  const uploadedFiles = db.prepare(
    'SELECT id, filename, mimetype, size, conv_id, chunk_count, embed_status, created_at FROM uploaded_files ORDER BY created_at DESC'
  ).all()

  const exportData = {
    exportedAt: new Date().toISOString(),
    conversations,
    nodes,
    profile,
    memoryFacts,
    uploadedFiles
  }

  const json = JSON.stringify(exportData, null, 2)
  return new Response(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="anima-export.json"'
    }
  })
})

// GET /api/storage/history/:conversationId — 读取对话 AI 消息历史
storageRoutes.get('/history/:conversationId', (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()
  const row = db.prepare('SELECT messages FROM conversation_history WHERE conversation_id = ?').get(conversationId) as
    { messages: string } | undefined
  let messages: unknown[] = []
  try { messages = row ? JSON.parse(row.messages) : [] } catch { messages = [] }
  return c.json({ messages: Array.isArray(messages) ? messages : [] })
})

// PUT /api/storage/history/:conversationId — 保存对话 AI 消息历史
storageRoutes.put('/history/:conversationId', async (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()
  const body = await c.req.json()
  const messages = body.messages
  if (!Array.isArray(messages)) return c.json({ error: 'messages must be array' }, 400)
  // 限制历史条目数，防止无限增长（保留最近 100 条消息）
  const trimmed = messages.slice(-100)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO conversation_history (conversation_id, messages, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
  `).run(conversationId, JSON.stringify(trimmed), now)
  return c.json({ ok: true })
})

// DELETE /api/storage/history/:conversationId — 删除对话历史（节点删除时调用）
storageRoutes.delete('/history/:conversationId', (c) => {
  const db = userDb(c)
  const { conversationId } = c.req.param()
  db.prepare('DELETE FROM conversation_history WHERE conversation_id = ?').run(conversationId)
  return c.json({ ok: true })
})

// GET /api/storage/:filename
storageRoutes.get('/:filename', (c) => {
  const db = userDb(c)
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as
    | { content: string }
    | undefined

  if (!row) {
    if (filename === 'profile.json') {
      return c.text(JSON.stringify({ rules: [] }))
    }
    if (filename === 'semantic-edges.json' || filename === 'logical-edges.json') {
      return c.text('[]')
    }
    // Lenny 文件首次访问时返回空值（而非 404），前端会用种子数据初始化
    if (filename === 'lenny-nodes.json' || filename === 'lenny-edges.json') {
      return c.text('[]')
    }
    if (filename === 'lenny-conversations.jsonl' || filename === 'conversations.jsonl') {
      return c.text('')
    }
    // PG / Zhang / Wang Space 文件首次访问降级（同 Lenny）
    if (filename === 'pg-nodes.json' || filename === 'pg-edges.json' ||
        filename === 'zhang-nodes.json' || filename === 'zhang-edges.json' ||
        filename === 'wang-nodes.json' || filename === 'wang-edges.json') {
      return c.text('[]')
    }
    if (filename === 'pg-conversations.jsonl' ||
        filename === 'zhang-conversations.jsonl' ||
        filename === 'wang-conversations.jsonl') {
      return c.text('')
    }
    // custom-spaces.json 首次访问返回空数组（新用户无创建过任何自定义空间）
    if (filename === 'custom-spaces.json') {
      return c.text('[]')
    }
    return c.text('', 404)
  }

  const tailLinesRaw = c.req.query('tailLines')
  if (tailLinesRaw) {
    const parsed = Number.parseInt(tailLinesRaw, 10)
    const tailLines = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_TAIL_LINES) : 0
    if (tailLines > 0) {
      return c.text(tailTextByLines(row.content, tailLines))
    }
  }

  return c.text(row.content)
})

// PUT /api/storage/:filename
storageRoutes.put('/:filename', async (c) => {
  const db = userDb(c)
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const content = await c.req.text()
  // P0-2: 防止超大 payload 写入（10 MB 限制）
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_SIZE) {
    return c.json({ error: '内容过大，最大支持 10MB' }, 413)
  }
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO storage (filename, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `).run(filename, content, now)

  return c.json({ ok: true })
})

// POST /api/storage/:filename/append
storageRoutes.post('/:filename/append', async (c) => {
  const db = userDb(c)
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const line = await c.req.text()
  // P0-2: 单次追加上限 1 MB，防止超大行写入
  if (Buffer.byteLength(line, 'utf8') > MAX_APPEND_SIZE) {
    return c.json({ error: '单次追加内容过大，最大支持 1MB' }, 413)
  }
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO storage (filename, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET
      content = storage.content || CASE WHEN storage.content = '' THEN '' ELSE char(10) END || excluded.content,
      updated_at = excluded.updated_at
  `).run(filename, line, now)

  return c.json({ ok: true })
})
