/**
 * Storage routes
 *
 * GET  /api/storage/:filename          → read file content
 * PUT  /api/storage/:filename          → write file content (raw text body)
 * POST /api/storage/:filename/append   → append line to file (raw text body)
 */

import { Hono } from 'hono'
import { db } from '../db'
import { isValidFilename } from '../../shared/constants'

export const storageRoutes = new Hono()

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

  // Append a newline-terminated line atomically
  db.prepare(`
    INSERT INTO storage (filename, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET
      content = storage.content || CASE WHEN storage.content = '' THEN '' ELSE char(10) END || excluded.content,
      updated_at = excluded.updated_at
  `).run(filename, line, now)

  return c.json({ ok: true })
})
