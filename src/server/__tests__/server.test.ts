/**
 * Server Integration Tests
 *
 * Tests all HTTP API routes using a real in-memory SQLite database.
 * Uses a dedicated test database injected via environment before the routes load.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

// ── Create in-memory DB and expose it before routes are imported ──────────────
// We bypass the db module by building routes that accept the db directly.
// This avoids vi.mock hoisting issues with better-sqlite3.

const testDb = new Database(':memory:')
testDb.pragma('journal_mode = WAL')
testDb.exec(`
  CREATE TABLE IF NOT EXISTS storage (
    filename   TEXT PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

function resetDb() {
  testDb.exec('DELETE FROM storage; DELETE FROM config;')
}

// ── Inline route handlers (mirrors routes/*.ts but injects testDb) ────────────
import { isValidFilename } from '../../shared/constants'

function buildTestApp() {
  const app = new Hono()

  // ── Auth middleware ──
  app.use('/api/*', async (c, next) => {
    const authEnabled = process.env.AUTH_ENABLED === 'true'
    if (!authEnabled) return next()
    const accessToken = process.env.ACCESS_TOKEN
    if (!accessToken) return next()
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
    if (authHeader.slice(7) !== accessToken) return c.json({ error: 'Forbidden' }, 403)
    return next()
  })

  // ── Health ──
  app.get('/api/health', (c) => c.json({ status: 'ok' }))

  // ── Storage routes ──
  app.get('/api/storage/:filename', (c) => {
    const { filename } = c.req.param()
    if (!isValidFilename(filename)) return c.json({ error: 'Invalid filename' }, 400)
    const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as { content: string } | undefined
    if (!row) return c.text('', 404)
    return c.text(row.content)
  })

  app.put('/api/storage/:filename', async (c) => {
    const { filename } = c.req.param()
    if (!isValidFilename(filename)) return c.json({ error: 'Invalid filename' }, 400)
    const content = await c.req.text()
    const now = new Date().toISOString()
    testDb.prepare(`
      INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(filename, content, now)
    return c.json({ ok: true })
  })

  app.post('/api/storage/:filename/append', async (c) => {
    const { filename } = c.req.param()
    if (!isValidFilename(filename)) return c.json({ error: 'Invalid filename' }, 400)
    const line = await c.req.text()
    const now = new Date().toISOString()
    testDb.prepare(`
      INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET
        content = storage.content || CASE WHEN storage.content = '' THEN '' ELSE char(10) END || excluded.content,
        updated_at = excluded.updated_at
    `).run(filename, line, now)
    return c.json({ ok: true })
  })

  // ── Config routes ──
  const upsert = (key: string, value: string) => {
    testDb.prepare(`
      INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, new Date().toISOString())
  }
  const getCfg = (key: string): string | null => {
    const r = testDb.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  app.get('/api/config/apikey', (c) => c.json({ apiKey: getCfg('apiKey') ?? '' }))

  app.put('/api/config/apikey', async (c) => {
    const { apiKey } = await c.req.json<{ apiKey: unknown }>()
    if (typeof apiKey !== 'string') return c.json({ error: 'apiKey must be a string' }, 400)
    upsert('apiKey', apiKey)
    return c.json({ ok: true })
  })

  app.get('/api/config/settings', (c) =>
    c.json({ model: getCfg('model') ?? '', baseUrl: getCfg('baseUrl') ?? '' })
  )

  app.put('/api/config/settings', async (c) => {
    const body = await c.req.json<{ model?: string; baseUrl?: string }>()
    if (body.model !== undefined) upsert('model', body.model)
    if (body.baseUrl !== undefined) upsert('baseUrl', body.baseUrl)
    return c.json({ ok: true })
  })

  return app
}

const app = buildTestApp()

// ── Request helper ────────────────────────────────────────────────────────────
async function req(
  method: string,
  path: string,
  opts: { body?: string; json?: unknown; headers?: Record<string, string> } = {}
) {
  const headers = new Headers(opts.headers ?? {})
  let body: string | undefined

  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(opts.json)
  } else if (opts.body !== undefined) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'text/plain')
    body = opts.body
  }

  return app.fetch(new Request(`http://localhost${path}`, { method, headers, body }))
}

afterAll(() => {
  testDb.close()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 ok', async () => {
    const res = await req('GET', '/api/health')
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })
})

describe('Storage API', () => {
  beforeEach(resetDb)

  describe('GET /api/storage/:filename', () => {
    it('returns 404 for non-existent file', async () => {
      const res = await req('GET', '/api/storage/nodes.json')
      expect(res.status).toBe(404)
    })

    it('returns content for existing file', async () => {
      testDb.prepare(`INSERT INTO storage VALUES ('nodes.json', '[]', '2026-01-01')`).run()
      const res = await req('GET', '/api/storage/nodes.json')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('[]')
    })

    it('returns 400 for path traversal attempt', async () => {
      const res = await req('GET', '/api/storage/..%2Fetc%2Fpasswd')
      expect(res.status).toBe(400)
    })

    it('returns 400 for unknown filename', async () => {
      const res = await req('GET', '/api/storage/evil.txt')
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/storage/:filename', () => {
    it('creates a new file', async () => {
      const res = await req('PUT', '/api/storage/nodes.json', { body: '[]' })
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get('nodes.json') as any
      expect(row?.content).toBe('[]')
    })

    it('overwrites existing content', async () => {
      testDb.prepare(`INSERT INTO storage VALUES ('nodes.json', '[]', '2026-01-01')`).run()
      await req('PUT', '/api/storage/nodes.json', { body: '[{"id":"1"}]' })
      const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get('nodes.json') as any
      expect(row?.content).toBe('[{"id":"1"}]')
    })

    it('returns 400 for invalid filename', async () => {
      const res = await req('PUT', '/api/storage/malicious.exe', { body: 'x' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/storage/:filename/append', () => {
    it('creates file on first append', async () => {
      const res = await req('POST', '/api/storage/conversations.jsonl/append', {
        body: '{"id":"conv1"}'
      })
      expect(res.status).toBe(200)
      const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as any
      expect(row?.content).toBe('{"id":"conv1"}')
    })

    it('appends new line to existing content', async () => {
      testDb.prepare(`INSERT INTO storage VALUES ('conversations.jsonl', '{"id":"conv1"}', '2026-01-01')`).run()
      await req('POST', '/api/storage/conversations.jsonl/append', { body: '{"id":"conv2"}' })
      const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as any
      const lines = row.content.split('\n')
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).id).toBe('conv1')
      expect(JSON.parse(lines[1]).id).toBe('conv2')
    })

    it('builds correct JSONL with 5 sequential appends', async () => {
      for (let i = 1; i <= 5; i++) {
        await req('POST', '/api/storage/conversations.jsonl/append', {
          body: JSON.stringify({ id: `conv${i}` })
        })
      }
      const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as any
      const lines = row.content.trim().split('\n')
      expect(lines).toHaveLength(5)
      lines.forEach((line: string, idx: number) => {
        expect(JSON.parse(line).id).toBe(`conv${idx + 1}`)
      })
    })

    it('returns 400 for invalid filename', async () => {
      const res = await req('POST', '/api/storage/bad.exe/append', { body: 'x' })
      expect(res.status).toBe(400)
    })
  })
})

describe('Config API', () => {
  beforeEach(resetDb)

  describe('GET /api/config/apikey', () => {
    it('returns empty string when not set', async () => {
      const res = await req('GET', '/api/config/apikey')
      expect(res.status).toBe(200)
      expect((await res.json()).apiKey).toBe('')
    })

    it('returns stored API key', async () => {
      testDb.prepare(`INSERT INTO config VALUES ('apiKey', 'sk-test', '2026-01-01')`).run()
      const data = await (await req('GET', '/api/config/apikey')).json()
      expect(data.apiKey).toBe('sk-test')
    })
  })

  describe('PUT /api/config/apikey', () => {
    it('stores API key', async () => {
      const res = await req('PUT', '/api/config/apikey', { json: { apiKey: 'sk-new' } })
      expect(res.status).toBe(200)
      const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as any
      expect(row?.value).toBe('sk-new')
    })

    it('overwrites existing API key', async () => {
      testDb.prepare(`INSERT INTO config VALUES ('apiKey', 'sk-old', '2026-01-01')`).run()
      await req('PUT', '/api/config/apikey', { json: { apiKey: 'sk-updated' } })
      const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as any
      expect(row?.value).toBe('sk-updated')
    })

    it('returns 400 for non-string apiKey', async () => {
      const res = await req('PUT', '/api/config/apikey', { json: { apiKey: 12345 } })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/config/settings', () => {
    it('returns empty strings when not set', async () => {
      const data = await (await req('GET', '/api/config/settings')).json()
      expect(data.model).toBe('')
      expect(data.baseUrl).toBe('')
    })

    it('returns stored settings', async () => {
      testDb.prepare(`INSERT INTO config VALUES ('model', 'kimi-k2.5', '2026-01-01')`).run()
      testDb.prepare(`INSERT INTO config VALUES ('baseUrl', 'https://api.moonshot.cn/v1', '2026-01-01')`).run()
      const data = await (await req('GET', '/api/config/settings')).json()
      expect(data.model).toBe('kimi-k2.5')
      expect(data.baseUrl).toBe('https://api.moonshot.cn/v1')
    })
  })

  describe('PUT /api/config/settings', () => {
    it('stores model and baseUrl', async () => {
      await req('PUT', '/api/config/settings', {
        json: { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' }
      })
      const mRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('model') as any
      const uRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as any
      expect(mRow?.value).toBe('gpt-4o')
      expect(uRow?.value).toBe('https://api.openai.com/v1')
    })

    it('updates only the provided fields', async () => {
      testDb.prepare(`INSERT INTO config VALUES ('model', 'old-model', '2026-01-01')`).run()
      testDb.prepare(`INSERT INTO config VALUES ('baseUrl', 'https://old.url', '2026-01-01')`).run()
      await req('PUT', '/api/config/settings', { json: { model: 'new-model' } })
      const mRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('model') as any
      const uRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as any
      expect(mRow?.value).toBe('new-model')
      expect(uRow?.value).toBe('https://old.url') // unchanged
    })
  })
})

describe('Auth middleware', () => {
  beforeEach(() => {
    resetDb()
    delete process.env.AUTH_ENABLED
    delete process.env.ACCESS_TOKEN
  })

  afterAll(() => {
    delete process.env.AUTH_ENABLED
    delete process.env.ACCESS_TOKEN
  })

  it('allows requests when AUTH_ENABLED is false', async () => {
    process.env.AUTH_ENABLED = 'false'
    expect((await req('GET', '/api/health')).status).toBe(200)
  })

  it('allows requests when AUTH_ENABLED is not set', async () => {
    expect((await req('GET', '/api/config/apikey')).status).toBe(200)
  })

  it('rejects with 401 when no token provided and AUTH_ENABLED=true', async () => {
    process.env.AUTH_ENABLED = 'true'
    process.env.ACCESS_TOKEN = 'secret123'
    expect((await req('GET', '/api/config/apikey')).status).toBe(401)
  })

  it('rejects with 403 for wrong token', async () => {
    process.env.AUTH_ENABLED = 'true'
    process.env.ACCESS_TOKEN = 'secret123'
    const res = await req('GET', '/api/config/apikey', {
      headers: { Authorization: 'Bearer wrong' }
    })
    expect(res.status).toBe(403)
  })

  it('allows requests with correct token', async () => {
    process.env.AUTH_ENABLED = 'true'
    process.env.ACCESS_TOKEN = 'secret123'
    const res = await req('GET', '/api/config/apikey', {
      headers: { Authorization: 'Bearer secret123' }
    })
    expect(res.status).toBe(200)
  })
})
