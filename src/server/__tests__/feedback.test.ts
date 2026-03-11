/**
 * Unit tests for feedback routes
 * Uses in-memory SQLite + inline Hono route (same pattern as config routes)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

// Re-create a minimal in-memory DB with feedback_reports table
function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_reports (
      id          TEXT NOT NULL PRIMARY KEY,
      type        TEXT NOT NULL DEFAULT 'feedback',
      message     TEXT NOT NULL DEFAULT '',
      context     TEXT NOT NULL DEFAULT '{}',
      image_data  BLOB,
      image_mime  TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_reports(created_at DESC);
  `)
  return db
}

// Build a minimal Hono app wired with feedback routes and the test db
function buildApp(db: InstanceType<typeof Database>) {
  type Env = { Variables: { db: InstanceType<typeof Database> } }
  const app = new Hono<Env>()
  // Inject db into context
  app.use('*', async (c, next) => {
    c.set('db', db)
    return next()
  })

  // Import and mount feedback routes inline to avoid circular env issues
  app.get('/feedback', (c) => {
    const rows = c.get('db').prepare(
      'SELECT id, type, message, context, image_mime, created_at FROM feedback_reports ORDER BY created_at DESC'
    ).all()
    return c.json({ reports: rows })
  })

  app.post('/feedback', async (c) => {
    const body = await c.req.json<{ type?: string; message?: string; context?: Record<string, unknown>; imageData?: string; imageMime?: string }>()
    const message = body.message ?? ''
    if (!message.trim()) return c.json({ error: 'message is required' }, 400)

    const { randomUUID } = await import('crypto')
    const id = randomUUID()
    const type = body.type ?? 'feedback'
    const context = JSON.stringify(body.context ?? {})
    const imageData = body.imageData ? Buffer.from(body.imageData, 'base64') : null
    const imageMime = body.imageMime ?? null
    const createdAt = new Date().toISOString()

    c.get('db').prepare(
      'INSERT INTO feedback_reports (id, type, message, context, image_data, image_mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, type, message, context, imageData, imageMime, createdAt)

    return c.json({ ok: true, id }, 201)
  })

  return app
}

describe('feedback routes', () => {
  let db: InstanceType<typeof Database>
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    db = createTestDb()
    app = buildApp(db)
  })

  it('POST /feedback returns 201 + id', async () => {
    const req = new Request('http://localhost/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bug', message: '页面崩溃了', context: { url: 'http://localhost/' } }),
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(201)
    const data = await res.json() as { ok: boolean; id: string }
    expect(data.ok).toBe(true)
    expect(typeof data.id).toBe('string')
    expect(data.id.length).toBeGreaterThan(0)
  })

  it('GET /feedback returns list', async () => {
    // Insert one entry first
    db.prepare(
      "INSERT INTO feedback_reports (id, type, message, context, created_at) VALUES ('test-1', 'feedback', 'nice app', '{}', datetime('now'))"
    ).run()

    const req = new Request('http://localhost/feedback', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.ok).toBe(true)
    const data = await res.json() as { reports: unknown[] }
    expect(Array.isArray(data.reports)).toBe(true)
    expect(data.reports.length).toBe(1)
  })

  it('POST /feedback without message returns 400', async () => {
    const req = new Request('http://localhost/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feedback', message: '' }),
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toMatch(/message/)
  })

  it('POST /feedback with whitespace-only message returns 400', async () => {
    const req = new Request('http://localhost/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
  })

  it('submitted feedback is persisted and readable via GET', async () => {
    // POST a report
    const postReq = new Request('http://localhost/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bug', message: '测试落库', context: { url: '/' } }),
    })
    const postRes = await app.fetch(postReq)
    const { id } = await postRes.json() as { id: string }

    // GET and verify
    const getReq = new Request('http://localhost/feedback', { method: 'GET' })
    const getRes = await app.fetch(getReq)
    const { reports } = await getRes.json() as { reports: { id: string; message: string }[] }
    const found = reports.find(r => r.id === id)
    expect(found).toBeDefined()
    expect(found?.message).toBe('测试落库')
  })
})
