/**
 * Storage routes
 *
 * 静态路由必须在 /:filename 通配路由之前注册，否则会被拦截。
 *
 * POST /api/storage/file               → 上传二进制文件 (multipart/form-data)
 * GET  /api/storage/file/:id           → 下载二进制文件
 * GET  /api/storage/export             → 导出全量数据 (JSON)
 * GET  /api/storage/:filename          → 读取文件内容
 * PUT  /api/storage/:filename          → 写入文件内容 (raw text body)
 * POST /api/storage/:filename/append   → 追加一行 (raw text body)
 */

import { Hono } from 'hono'
import { db } from '../db'
import { isValidFilename } from '../../shared/constants'

export const storageRoutes = new Hono()

// POST /api/storage/file — 上传二进制文件（multipart/form-data）
storageRoutes.post('/file', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined
  if (!file) return c.json({ error: 'file required' }, 400)

  const id = (body['id'] as string) || crypto.randomUUID()
  const textContent = (body['textContent'] as string) || ''
  const convId = (body['convId'] as string) || null
  const now = new Date().toISOString()

  const buffer = Buffer.from(await file.arrayBuffer())

  db.prepare(`
    INSERT OR REPLACE INTO uploaded_files (id, filename, mimetype, size, content, text_content, conv_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, file.name, file.type || 'application/octet-stream', buffer.length, buffer, textContent || null, convId, now)

  return c.json({ ok: true, fileId: id, filename: file.name, size: buffer.length })
})

// GET /api/storage/file/:id — 下载二进制文件
storageRoutes.get('/file/:id', (c) => {
  const { id } = c.req.param()
  const row = db.prepare('SELECT filename, mimetype, content FROM uploaded_files WHERE id = ?').get(id) as
    { filename: string; mimetype: string; content: Buffer } | undefined

  if (!row || !row.content) return c.json({ error: 'not found' }, 404)

  const safeFilename = encodeURIComponent(row.filename)
  return new Response(new Uint8Array(row.content), {
    status: 200,
    headers: {
      'Content-Type': row.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${safeFilename}`
    }
  })
})

// GET /api/storage/export — 导出所有数据（对话 / 节点 / 记忆 / 进化基因）
storageRoutes.get('/export', (_c) => {
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
    'SELECT id, fact, source_conv_id, created_at FROM memory_facts ORDER BY created_at DESC'
  ).all()

  const exportData = {
    exportedAt: new Date().toISOString(),
    conversations,
    nodes,
    profile,
    memoryFacts
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

// GET /api/storage/:filename
storageRoutes.get('/:filename', (c) => {
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as
    | { content: string }
    | undefined

  if (!row) {
    return c.text('', 404)
  }

  return c.text(row.content)
})

// PUT /api/storage/:filename
storageRoutes.put('/:filename', async (c) => {
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const content = await c.req.text()
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
  const { filename } = c.req.param()

  if (!isValidFilename(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const line = await c.req.text()
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
