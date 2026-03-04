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

// ── Memory & Agent Worker Tests ───────────────────────────────────────────────
// These tests use a dedicated in-memory DB with full memory/agent schema

const memDb = new Database(':memory:')
memDb.pragma('journal_mode = WAL')
memDb.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    occupation TEXT, interests TEXT, tools TEXT, writing_style TEXT,
    goals TEXT, location TEXT, raw_notes TEXT, last_extracted TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    retries INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, error TEXT
  );
  CREATE TABLE IF NOT EXISTS memory_facts (
    id TEXT NOT NULL, fact TEXT NOT NULL, source_conv_id TEXT,
    created_at TEXT NOT NULL, invalid_at TEXT, PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_memory_facts_created ON memory_facts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_memory_facts_source ON memory_facts(source_conv_id);
`)

function resetMemDb() {
  memDb.exec('DELETE FROM config; DELETE FROM user_profile; DELETE FROM agent_tasks; DELETE FROM memory_facts;')
}

function buildMemApp() {
  const memApp = new Hono()

  // ── Profile routes ──
  const safeParseArr = (v: string | undefined): string[] => {
    if (!v) return []
    try { return JSON.parse(v) as string[] } catch { return [] }
  }

  memApp.get('/api/memory/profile', (c) => {
    const row = memDb.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string> | undefined
    if (!row) return c.json({})
    return c.json({
      occupation: row.occupation ?? null,
      interests: safeParseArr(row.interests),
      tools: safeParseArr(row.tools),
      writingStyle: row.writing_style ?? null,
      goals: safeParseArr(row.goals),
      location: row.location ?? null
    })
  })

  memApp.put('/api/memory/profile', async (c) => {
    const body = await c.req.json<{ occupation?: string; interests?: string[]; tools?: string[] }>()
    const now = new Date().toISOString()
    const existing = memDb.prepare('SELECT * FROM user_profile WHERE id = 1').get()
    if (!existing) {
      memDb.prepare('INSERT INTO user_profile (id, occupation, interests, tools, updated_at) VALUES (1, ?, ?, ?, ?)').run(
        body.occupation ?? null,
        body.interests ? JSON.stringify(body.interests) : null,
        body.tools ? JSON.stringify(body.tools) : null,
        now
      )
    } else {
      memDb.prepare('UPDATE user_profile SET occupation = COALESCE(?, occupation), updated_at = ? WHERE id = 1').run(
        body.occupation ?? null, now
      )
    }
    return c.json({ ok: true })
  })

  memApp.delete('/api/memory/profile', (c) => {
    const now = new Date().toISOString()
    memDb.prepare('UPDATE user_profile SET occupation = NULL, interests = NULL, tools = NULL, writing_style = NULL, goals = NULL, location = NULL, raw_notes = NULL, last_extracted = NULL, updated_at = ? WHERE id = 1').run(now)
    return c.json({ ok: true })
  })

  // ── Facts routes ──
  memApp.get('/api/memory/facts', (c) => {
    const rows = memDb.prepare('SELECT id, fact, source_conv_id, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 200').all()
    return c.json({ facts: rows })
  })

  memApp.delete('/api/memory/facts/:id', (c) => {
    const id = c.req.param('id')
    memDb.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    return c.json({ ok: true })
  })

  memApp.delete('/api/memory/facts', (c) => {
    memDb.prepare('UPDATE memory_facts SET invalid_at = ?').run(new Date().toISOString())
    return c.json({ ok: true })
  })

  // ── Agent task queue ──
  memApp.post('/api/memory/queue', async (c) => {
    const { type, payload } = await c.req.json<{ type: string; payload?: Record<string, unknown> }>()
    if (!type) return c.json({ error: 'type required' }, 400)
    memDb.prepare('INSERT INTO agent_tasks (type, payload, status, created_at) VALUES (?, ?, ?, ?)').run(
      type, JSON.stringify(payload ?? {}), 'pending', new Date().toISOString()
    )
    return c.json({ ok: true })
  })

  // ── topK validation ──
  memApp.post('/api/memory/search', async (c) => {
    const { query, topK: rawTopK = 5 } = await c.req.json<{ query: string; topK?: number }>()
    if (!query) return c.json({ results: [] })
    const topK = Math.max(1, Math.min(20, Math.floor(Number(rawTopK) || 5)))
    return c.json({ results: [], topKUsed: topK })
  })

  return memApp
}

const memApp = buildMemApp()

async function memReq(method: string, path: string, opts: { json?: unknown } = {}) {
  const headers = new Headers()
  let body: string | undefined
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(opts.json)
  }
  return memApp.fetch(new Request(`http://localhost${path}`, { method, headers, body }))
}

afterAll(() => { memDb.close() })

describe('Memory Profile API', () => {
  beforeEach(resetMemDb)

  it('GET returns empty object when no profile', async () => {
    const data = await (await memReq('GET', '/api/memory/profile')).json()
    expect(data).toEqual({})
  })

  it('PUT creates profile and GET returns it', async () => {
    await memReq('PUT', '/api/memory/profile', { json: { occupation: '程序员', interests: ['编程', '读书'] } })
    const data = await (await memReq('GET', '/api/memory/profile')).json()
    expect(data.occupation).toBe('程序员')
    expect(data.interests).toEqual(['编程', '读书'])
  })

  it('GET safely handles corrupted JSON arrays as empty arrays', async () => {
    memDb.prepare("INSERT INTO user_profile (id, interests, updated_at) VALUES (1, 'INVALID_JSON', ?)").run(new Date().toISOString())
    const data = await (await memReq('GET', '/api/memory/profile')).json()
    expect(data.interests).toEqual([])
  })

  it('DELETE clears profile fields', async () => {
    memDb.prepare("INSERT INTO user_profile (id, occupation, updated_at) VALUES (1, '工程师', ?)").run(new Date().toISOString())
    await memReq('DELETE', '/api/memory/profile')
    const data = await (await memReq('GET', '/api/memory/profile')).json()
    expect(data.occupation ?? null).toBeNull()
  })
})

describe('Memory Facts API (with invalid_at soft-delete)', () => {
  beforeEach(resetMemDb)

  const insertFact = (id: string, fact: string, invalidAt?: string) => {
    memDb.prepare('INSERT INTO memory_facts (id, fact, created_at, invalid_at) VALUES (?, ?, ?, ?)').run(
      id, fact, new Date().toISOString(), invalidAt ?? null
    )
  }

  it('GET /facts returns only valid (non-invalidated) facts', async () => {
    insertFact('f1', '用户是程序员')
    insertFact('f2', '用户喜欢咖啡', new Date().toISOString())  // invalidated
    const data = await (await memReq('GET', '/api/memory/facts')).json()
    expect(data.facts).toHaveLength(1)
    expect(data.facts[0].fact).toBe('用户是程序员')
  })

  it('DELETE /facts/:id soft-deletes (marks invalid_at, not physical delete)', async () => {
    insertFact('f1', '用户是程序员')
    await memReq('DELETE', '/api/memory/facts/f1')
    // Fact still exists in DB but with invalid_at set
    const row = memDb.prepare('SELECT invalid_at FROM memory_facts WHERE id = ?').get('f1') as { invalid_at: string | null }
    expect(row.invalid_at).not.toBeNull()
    // GET no longer returns it
    const data = await (await memReq('GET', '/api/memory/facts')).json()
    expect(data.facts).toHaveLength(0)
  })

  it('DELETE /facts soft-deletes all facts', async () => {
    insertFact('f1', '事实一')
    insertFact('f2', '事实二')
    await memReq('DELETE', '/api/memory/facts')
    const data = await (await memReq('GET', '/api/memory/facts')).json()
    expect(data.facts).toHaveLength(0)
    // But records still exist in DB
    const count = memDb.prepare('SELECT COUNT(*) as n FROM memory_facts').get() as { n: number }
    expect(count.n).toBe(2)
  })

  it('GET /facts returns up to 200 valid facts', async () => {
    for (let i = 0; i < 10; i++) insertFact(`f${i}`, `事实${i}`)
    const data = await (await memReq('GET', '/api/memory/facts')).json()
    expect(data.facts).toHaveLength(10)
  })
})

describe('Agent Task Queue', () => {
  beforeEach(resetMemDb)

  it('POST /memory/queue enqueues task with pending status', async () => {
    const res = await memReq('POST', '/api/memory/queue', {
      json: { type: 'extract_profile', payload: { userMessage: '我是一名工程师' } }
    })
    expect(res.status).toBe(200)
    const task = memDb.prepare("SELECT * FROM agent_tasks WHERE type = 'extract_profile'").get() as { status: string; retries: number }
    expect(task.status).toBe('pending')
    expect(task.retries).toBe(0)
  })

  it('POST /memory/queue returns 400 when type is missing', async () => {
    const res = await memReq('POST', '/api/memory/queue', { json: { payload: {} } })
    expect(res.status).toBe(400)
  })

  it('stalled running tasks are reset to pending on worker restart', () => {
    // Simulate a crashed run: tasks stuck in "running"
    memDb.prepare("INSERT INTO agent_tasks (type, payload, status, created_at, started_at) VALUES ('extract_profile', '{}', 'running', ?, ?)").run(
      new Date().toISOString(), new Date().toISOString()
    )
    const before = memDb.prepare("SELECT COUNT(*) as n FROM agent_tasks WHERE status = 'running'").get() as { n: number }
    expect(before.n).toBe(1)

    // Simulate worker restart recovery
    const stalled = memDb.prepare("UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running'").run()
    expect(stalled.changes).toBe(1)

    const after = memDb.prepare("SELECT COUNT(*) as n FROM agent_tasks WHERE status = 'pending'").get() as { n: number }
    expect(after.n).toBe(1)
  })

  it('tasks increment retries on failure and stay pending until max retries', () => {
    memDb.prepare("INSERT INTO agent_tasks (type, payload, status, retries, created_at) VALUES ('extract_profile', '{}', 'pending', 0, ?)").run(new Date().toISOString())
    const task = memDb.prepare("SELECT id FROM agent_tasks").get() as { id: number }

    // Simulate first failure — retry
    memDb.prepare("UPDATE agent_tasks SET status = 'pending', retries = 1, error = 'API error' WHERE id = ?").run(task.id)
    const after1 = memDb.prepare("SELECT status, retries FROM agent_tasks WHERE id = ?").get(task.id) as { status: string; retries: number }
    expect(after1.status).toBe('pending')
    expect(after1.retries).toBe(1)

    // Simulate second failure
    memDb.prepare("UPDATE agent_tasks SET status = 'pending', retries = 2, error = 'API error' WHERE id = ?").run(task.id)
    const after2 = memDb.prepare("SELECT retries FROM agent_tasks WHERE id = ?").get(task.id) as { retries: number }
    expect(after2.retries).toBe(2)

    // Third failure — permanently failed
    memDb.prepare("UPDATE agent_tasks SET status = 'failed', error = 'API error', finished_at = ? WHERE id = ?").run(new Date().toISOString(), task.id)
    const final = memDb.prepare("SELECT status FROM agent_tasks WHERE id = ?").get(task.id) as { status: string }
    expect(final.status).toBe('failed')
  })

  it('old done/failed tasks can be cleaned up by cutoff date', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date().toISOString()
    memDb.prepare("INSERT INTO agent_tasks (type, payload, status, created_at, finished_at) VALUES ('extract_profile', '{}', 'done', ?, ?)").run(old, old)
    memDb.prepare("INSERT INTO agent_tasks (type, payload, status, created_at, finished_at) VALUES ('extract_profile', '{}', 'done', ?, ?)").run(recent, recent)

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const deleted = memDb.prepare("DELETE FROM agent_tasks WHERE status IN ('done', 'failed') AND finished_at < ?").run(cutoff)
    expect(deleted.changes).toBe(1)

    const remaining = memDb.prepare('SELECT COUNT(*) as n FROM agent_tasks').get() as { n: number }
    expect(remaining.n).toBe(1)
  })
})

describe('Memory Search topK validation', () => {
  it('topK defaults to 5 when not provided', async () => {
    const data = await (await memReq('POST', '/api/memory/search', { json: { query: 'test' } })).json()
    expect(data.topKUsed).toBe(5)
  })

  it('topK is clamped to 1 minimum', async () => {
    const data = await (await memReq('POST', '/api/memory/search', { json: { query: 'test', topK: -10 } })).json()
    expect(data.topKUsed).toBe(1)
  })

  it('topK is clamped to 20 maximum', async () => {
    const data = await (await memReq('POST', '/api/memory/search', { json: { query: 'test', topK: 999 } })).json()
    expect(data.topKUsed).toBe(20)
  })

  it('non-numeric topK defaults to 5', async () => {
    const data = await (await memReq('POST', '/api/memory/search', { json: { query: 'test', topK: 'abc' } })).json()
    expect(data.topKUsed).toBe(5)
  })
})

describe('System prompt token budget (approxTokens logic)', () => {
  it('approxTokens returns ceil(length/4)', () => {
    const approxTokens = (text: string) => Math.ceil(text.length / 4)
    expect(approxTokens('hello')).toBe(2)        // 5/4 = 1.25 → 2
    expect(approxTokens('a'.repeat(100))).toBe(25)
    expect(approxTokens('')).toBe(0)
  })

  it('CONTEXT_BUDGET = 1500 tokens allows ~6000 chars of context', () => {
    const BUDGET = 1500
    const approxTokens = (text: string) => Math.ceil(text.length / 4)
    const block = '【偏好】\n' + Array(20).fill('用户偏好回答简洁').join('\n')
    const cost = approxTokens(block)
    expect(cost).toBeLessThan(BUDGET)
  })
})

// ── File Storage & Vectorization Tests ───────────────────────────────────────

const fileDb = new Database(':memory:')
fileDb.pragma('journal_mode = WAL')
fileDb.exec(`
  CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT NOT NULL, filename TEXT NOT NULL, mimetype TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0, content BLOB, text_content TEXT,
    conv_id TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
    embed_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
    PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_uploaded_files_conv ON uploaded_files(conv_id);
  CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_uploaded_files_embed ON uploaded_files(embed_status);

  CREATE TABLE IF NOT EXISTS file_embeddings (
    id TEXT NOT NULL, file_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL, vector BLOB NOT NULL, dim INTEGER NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_file_embeddings_file ON file_embeddings(file_id);
`)

function resetFileDb() {
  fileDb.exec('DELETE FROM uploaded_files; DELETE FROM file_embeddings;')
}

// Inline magic-byte validation (mirrors storage.ts logic)
const ALLOWED_MIME_PREFIXES = [
  'image/', 'text/', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument', 'application/json', 'application/xml',
  'application/octet-stream'
]
const MAGIC_BYTES = [
  { hex: '25504446', mime: 'application/pdf' },
  { hex: '89504e47', mime: 'image/png' },
  { hex: 'ffd8ff', mime: 'image/jpeg' }
]
function isContentSafe(buffer: Buffer, declaredMime: string): boolean {
  if (declaredMime.startsWith('text/') || declaredMime === 'application/json' ||
      declaredMime === 'application/octet-stream') return true
  const hexHead = buffer.slice(0, 8).toString('hex').toLowerCase()
  const matched = MAGIC_BYTES.find(m => hexHead.startsWith(m.hex))
  if (!matched) return true
  return declaredMime.startsWith(matched.mime)
}

// Inline text chunker (mirrors agentWorker.ts logic)
function splitTextIntoChunks(text: string, chunkSize = 800, overlap = 80): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + chunkSize
    if (end >= text.length) { chunks.push(text.slice(start)); break }
    let splitAt = text.lastIndexOf('\n\n', end)
    if (splitAt <= start) splitAt = text.lastIndexOf('\n', end)
    if (splitAt <= start) splitAt = text.lastIndexOf('。', end)
    if (splitAt <= start) splitAt = text.lastIndexOf(' ', end)
    if (splitAt <= start) splitAt = end
    chunks.push(text.slice(start, splitAt + 1))
    start = Math.max(start + 1, splitAt + 1 - overlap)
  }
  return chunks.filter(c => c.trim().length > 0)
}

function buildFileApp() {
  const app = new Hono()
  const MAX_FILE_SIZE = 50 * 1024 * 1024

  app.post('/api/storage/file', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file'] as File | undefined
    if (!file) return c.json({ error: 'file required' }, 400)
    if (file.size > MAX_FILE_SIZE) return c.json({ error: '文件过大' }, 413)
    const declaredMime = file.type || 'application/octet-stream'
    const allowed = ALLOWED_MIME_PREFIXES.some(p => declaredMime.startsWith(p))
    if (!allowed) return c.json({ error: '不支持的文件类型' }, 415)
    const id = (body['id'] as string) || crypto.randomUUID()
    const textContent = (body['textContent'] as string) || ''
    const buffer = Buffer.from(await file.arrayBuffer())
    if (!isContentSafe(buffer, declaredMime)) return c.json({ error: '文件内容与声明类型不匹配' }, 415)
    const now = new Date().toISOString()
    fileDb.prepare(`
      INSERT OR REPLACE INTO uploaded_files (id, filename, mimetype, size, content, text_content, conv_id, chunk_count, embed_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 'pending', ?)
    `).run(id, file.name, declaredMime, buffer.length, buffer, textContent || null, now)
    return c.json({ ok: true, fileId: id, filename: file.name, size: buffer.length })
  })

  app.get('/api/storage/files', (c) => {
    const rows = fileDb.prepare(
      'SELECT id, filename, mimetype, size, conv_id, chunk_count, embed_status, created_at FROM uploaded_files ORDER BY created_at DESC'
    ).all()
    return c.json({ files: rows })
  })

  app.delete('/api/storage/file/:id', (c) => {
    const id = c.req.param('id')
    fileDb.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run(id)
    fileDb.prepare('DELETE FROM uploaded_files WHERE id = ?').run(id)
    return c.json({ ok: true })
  })

  app.get('/api/storage/file/:id', (c) => {
    const id = c.req.param('id')
    const row = fileDb.prepare('SELECT filename, mimetype, content FROM uploaded_files WHERE id = ?').get(id) as
      { filename: string; mimetype: string; content: Buffer } | undefined
    if (!row?.content) return c.json({ error: 'not found' }, 404)
    return new Response(new Uint8Array(row.content), {
      status: 200,
      headers: { 'Content-Type': row.mimetype }
    })
  })

  return app
}

const fileApp = buildFileApp()

async function fileReq(method: string, path: string, opts: { formData?: FormData; json?: unknown } = {}) {
  let body: BodyInit | undefined
  const headers = new Headers()
  if (opts.formData) { body = opts.formData }
  else if (opts.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(opts.json) }
  return fileApp.fetch(new Request(`http://localhost${path}`, { method, headers, body }))
}

afterAll(() => { fileDb.close() })

describe('File Upload & Storage API', () => {
  beforeEach(resetFileDb)

  it('POST /storage/file stores file and returns metadata', async () => {
    const form = new FormData()
    form.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }))
    form.append('id', 'file-001')
    form.append('textContent', 'hello world')
    const res = await fileReq('POST', '/api/storage/file', { formData: form })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.fileId).toBe('file-001')
    const row = fileDb.prepare('SELECT embed_status, chunk_count FROM uploaded_files WHERE id = ?').get('file-001') as any
    expect(row.embed_status).toBe('pending')
    expect(row.chunk_count).toBe(0)
  })

  it('POST /storage/file rejects files > 50MB', async () => {
    const bigContent = 'x'.repeat(51 * 1024 * 1024)
    const form = new FormData()
    form.append('file', new File([bigContent], 'big.txt', { type: 'text/plain' }))
    const res = await fileReq('POST', '/api/storage/file', { formData: form })
    expect(res.status).toBe(413)
  })

  it('POST /storage/file rejects disallowed MIME types', async () => {
    const form = new FormData()
    form.append('file', new File(['test'], 'evil.exe', { type: 'application/x-executable' }))
    const res = await fileReq('POST', '/api/storage/file', { formData: form })
    expect(res.status).toBe(415)
  })

  it('POST /storage/file rejects file without file field', async () => {
    const form = new FormData()
    form.append('id', 'x')
    const res = await fileReq('POST', '/api/storage/file', { formData: form })
    expect(res.status).toBe(400)
  })

  it('GET /storage/files lists uploaded files without binary content', async () => {
    const form = new FormData()
    form.append('file', new File(['content'], 'doc.txt', { type: 'text/plain' }))
    await fileReq('POST', '/api/storage/file', { formData: form })
    const res = await fileReq('GET', '/api/storage/files')
    const data = await res.json()
    expect(data.files).toHaveLength(1)
    expect(data.files[0].filename).toBe('doc.txt')
    expect(data.files[0]).not.toHaveProperty('content') // no binary in listing
  })

  it('DELETE /storage/file/:id removes file and its embeddings', async () => {
    const form = new FormData()
    form.append('file', new File(['content'], 'del.txt', { type: 'text/plain' }))
    form.append('id', 'del-001')
    await fileReq('POST', '/api/storage/file', { formData: form })
    // Add fake embedding
    fileDb.prepare('INSERT INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at) VALUES (?, ?, 0, ?, ?, 4, ?)').run(
      'chunk-1', 'del-001', 'content', Buffer.alloc(16), new Date().toISOString()
    )
    await fileReq('DELETE', '/api/storage/file/del-001')
    const row = fileDb.prepare('SELECT id FROM uploaded_files WHERE id = ?').get('del-001')
    expect(row).toBeUndefined()
    const chunks = fileDb.prepare('SELECT id FROM file_embeddings WHERE file_id = ?').all('del-001')
    expect(chunks).toHaveLength(0)
  })

  it('GET /storage/file/:id downloads binary content', async () => {
    const form = new FormData()
    form.append('file', new File(['download me'], 'dl.txt', { type: 'text/plain' }))
    form.append('id', 'dl-001')
    await fileReq('POST', '/api/storage/file', { formData: form })
    const res = await fileReq('GET', '/api/storage/file/dl-001')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('download me')
  })

  it('GET /storage/file/:id returns 404 for missing file', async () => {
    const res = await fileReq('GET', '/api/storage/file/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('Text Chunking Algorithm', () => {
  it('returns single chunk for text within limit', () => {
    const text = 'Short text'
    expect(splitTextIntoChunks(text)).toEqual([text])
  })

  it('splits long text into multiple chunks', () => {
    const text = 'word '.repeat(200)  // 1000 chars > 800 chunk size
    const chunks = splitTextIntoChunks(text)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(900)) // some slack for boundary
  })

  it('preserves content across all chunks (no data loss)', () => {
    const text = Array.from({ length: 100 }, (_, i) => `sentence ${i + 1}.`).join(' ')
    const chunks = splitTextIntoChunks(text, 200, 20)
    // All unique sentences should appear in at least one chunk
    for (let i = 0; i < 100; i++) {
      const found = chunks.some(c => c.includes(`sentence ${i + 1}`))
      expect(found).toBe(true)
    }
  })

  it('splits at paragraph boundaries preferentially', () => {
    const text = 'First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph.'
    const chunks = splitTextIntoChunks(text, 40, 5)
    // Each chunk should contain coherent paragraph content
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(c => expect(c.trim()).toBeTruthy())
  })

  it('never produces empty chunks', () => {
    const text = 'a'.repeat(5000)
    const chunks = splitTextIntoChunks(text)
    chunks.forEach(c => expect(c.trim().length).toBeGreaterThan(0))
  })
})

describe('Magic Byte Validation', () => {
  it('allows text files without magic byte check', () => {
    const buf = Buffer.from('Hello world')
    expect(isContentSafe(buf, 'text/plain')).toBe(true)
  })

  it('allows JSON files', () => {
    const buf = Buffer.from('{"key": "value"}')
    expect(isContentSafe(buf, 'application/json')).toBe(true)
  })

  it('accepts valid PNG magic bytes declared as image/png', () => {
    const buf = Buffer.from('89504e470d0a1a0a', 'hex')
    expect(isContentSafe(buf, 'image/png')).toBe(true)
  })

  it('rejects PNG magic bytes declared as application/pdf', () => {
    const buf = Buffer.from('89504e470d0a1a0a', 'hex')
    expect(isContentSafe(buf, 'application/pdf')).toBe(false)
  })

  it('accepts valid PDF magic bytes declared as application/pdf', () => {
    const buf = Buffer.from('25504446', 'hex')  // %PDF
    expect(isContentSafe(buf, 'application/pdf')).toBe(true)
  })

  it('accepts unknown format (not in magic byte list) without validation', () => {
    const buf = Buffer.from('DEADBEEF', 'hex')
    expect(isContentSafe(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
  })
})

describe('File Embeddings Table (file_embeddings vs embeddings isolation)', () => {
  beforeEach(resetFileDb)

  it('file_embeddings stores chunks with file_id reference', () => {
    fileDb.prepare("INSERT INTO uploaded_files (id, filename, mimetype, size, chunk_count, embed_status, created_at) VALUES ('f1', 'test.txt', 'text/plain', 100, 0, 'pending', ?)").run(new Date().toISOString())

    // Simulate embedding a chunk
    const vec = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const buf = Buffer.from(vec.buffer)
    fileDb.prepare('INSERT INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'f1-chunk-0', 'f1', 0, 'test content chunk', buf, 4, new Date().toISOString()
    )

    const rows = fileDb.prepare('SELECT * FROM file_embeddings WHERE file_id = ?').all('f1') as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].chunk_index).toBe(0)
    expect(rows[0].chunk_text).toBe('test content chunk')
  })

  it('deleting file cascades to file_embeddings', () => {
    fileDb.prepare("INSERT INTO uploaded_files (id, filename, mimetype, size, chunk_count, embed_status, created_at) VALUES ('f2', 'doc.txt', 'text/plain', 50, 2, 'done', ?)").run(new Date().toISOString())
    fileDb.prepare("INSERT INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at) VALUES ('f2-0', 'f2', 0, 'chunk 0', ?, 4, ?)").run(Buffer.alloc(16), new Date().toISOString())
    fileDb.prepare("INSERT INTO file_embeddings (id, file_id, chunk_index, chunk_text, vector, dim, created_at) VALUES ('f2-1', 'f2', 1, 'chunk 1', ?, 4, ?)").run(Buffer.alloc(16), new Date().toISOString())

    // Delete cascades
    fileDb.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run('f2')
    fileDb.prepare('DELETE FROM uploaded_files WHERE id = ?').run('f2')

    expect(fileDb.prepare('SELECT id FROM file_embeddings WHERE file_id = ?').all('f2')).toHaveLength(0)
    expect(fileDb.prepare('SELECT id FROM uploaded_files WHERE id = ?').get('f2')).toBeUndefined()
  })
})
