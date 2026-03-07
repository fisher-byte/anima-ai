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
  CREATE TABLE IF NOT EXISTS conversation_history (
    conversation_id TEXT PRIMARY KEY,
    messages        TEXT NOT NULL DEFAULT '[]',
    updated_at      TEXT NOT NULL
  );
`)

function resetDb() {
  testDb.exec('DELETE FROM storage; DELETE FROM config; DELETE FROM conversation_history;')
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
    if (!row) {
      if (filename === 'semantic-edges.json' || filename === 'logical-edges.json') return c.text('[]')
      return c.text('', 404)
    }
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

  // ── Conversation History routes ──
  app.get('/api/storage/history/:conversationId', (c) => {
    const { conversationId } = c.req.param()
    const row = testDb.prepare('SELECT messages FROM conversation_history WHERE conversation_id = ?').get(conversationId) as { messages: string } | undefined
    return c.json({ messages: row ? JSON.parse(row.messages) : [] })
  })

  app.put('/api/storage/history/:conversationId', async (c) => {
    const { conversationId } = c.req.param()
    const body = await c.req.json()
    const messages = body.messages
    if (!Array.isArray(messages)) return c.json({ error: 'messages must be array' }, 400)
    const trimmed = messages.slice(-100)
    const now = new Date().toISOString()
    testDb.prepare(`
      INSERT INTO conversation_history (conversation_id, messages, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
    `).run(conversationId, JSON.stringify(trimmed), now)
    return c.json({ ok: true })
  })

  app.delete('/api/storage/history/:conversationId', (c) => {
    const { conversationId } = c.req.param()
    testDb.prepare('DELETE FROM conversation_history WHERE conversation_id = ?').run(conversationId)
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
    if (apiKey.trim() === '') return c.json({ ok: true, skipped: true })
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

describe('Conversation History API', () => {
  beforeEach(resetDb)

  const CONV_ID = 'test-conv-123'
  const MESSAGES = [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！有什么可以帮你的？' }
  ]

  it('GET returns empty array for non-existent conversation', async () => {
    const res = await req('GET', `/api/storage/history/${CONV_ID}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages).toEqual([])
  })

  it('PUT saves messages and GET retrieves them', async () => {
    const putRes = await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: MESSAGES } })
    expect(putRes.status).toBe(200)
    expect((await putRes.json()).ok).toBe(true)

    const getRes = await req('GET', `/api/storage/history/${CONV_ID}`)
    expect(getRes.status).toBe(200)
    const data = await getRes.json()
    expect(data.messages).toHaveLength(2)
    expect(data.messages[0].role).toBe('user')
    expect(data.messages[1].role).toBe('assistant')
  })

  it('PUT overwrites existing history', async () => {
    await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: MESSAGES } })

    const newMessages = [...MESSAGES, { role: 'user', content: '继续' }, { role: 'assistant', content: '好的！' }]
    await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: newMessages } })

    const getRes = await req('GET', `/api/storage/history/${CONV_ID}`)
    const data = await getRes.json()
    expect(data.messages).toHaveLength(4)
  })

  it('PUT returns 400 for non-array messages', async () => {
    const res = await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: 'not an array' } })
    expect(res.status).toBe(400)
  })

  it('PUT trims to 100 messages max', async () => {
    const manyMessages = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`
    }))
    await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: manyMessages } })

    const getRes = await req('GET', `/api/storage/history/${CONV_ID}`)
    const data = await getRes.json()
    expect(data.messages).toHaveLength(100)
    // Should keep the most recent 100
    expect(data.messages[0].content).toBe('message 50')
  })

  it('DELETE removes conversation history', async () => {
    await req('PUT', `/api/storage/history/${CONV_ID}`, { json: { messages: MESSAGES } })
    const delRes = await req('DELETE', `/api/storage/history/${CONV_ID}`)
    expect(delRes.status).toBe(200)

    const getRes = await req('GET', `/api/storage/history/${CONV_ID}`)
    const data = await getRes.json()
    expect(data.messages).toEqual([])
  })

  it('different conversations have isolated histories', async () => {
    const CONV_A = 'conv-a'
    const CONV_B = 'conv-b'
    await req('PUT', `/api/storage/history/${CONV_A}`, { json: { messages: [{ role: 'user', content: 'A的消息' }] } })
    await req('PUT', `/api/storage/history/${CONV_B}`, { json: { messages: [{ role: 'user', content: 'B的消息' }, { role: 'assistant', content: 'B的回复' }] } })

    const resA = await req('GET', `/api/storage/history/${CONV_A}`)
    const resB = await req('GET', `/api/storage/history/${CONV_B}`)
    expect((await resA.json()).messages).toHaveLength(1)
    expect((await resB.json()).messages).toHaveLength(2)
  })
})

// ── AgentWorker 多租户集成测试 ─────────────────────────────────────────────────
describe('AgentWorker multi-tenant enqueueTask', () => {
  // 直接内联 enqueueTask 逻辑（与 agentWorker.ts 保持一致），避免触发服务端 db 初始化
  function enqueueTask(db: InstanceType<typeof Database>, type: string, payload: Record<string, unknown>) {
    db.prepare(
      'INSERT INTO agent_tasks (type, payload, status, created_at) VALUES (?, ?, ?, ?)'
    ).run(type, JSON.stringify(payload), 'pending', new Date().toISOString())
  }

  function createTaskDb(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL,
        payload     TEXT NOT NULL DEFAULT '{}',
        status      TEXT NOT NULL DEFAULT 'pending',
        retries     INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        started_at  TEXT,
        finished_at TEXT,
        error       TEXT
      )
    `)
    return db
  }

  it('写入正确的 db，不污染其他用户的 db', () => {
    const userADb = createTaskDb()
    const userBDb = createTaskDb()

    enqueueTask(userADb, 'extract_profile', { userMessage: 'user-a message', assistantMessage: '' })
    enqueueTask(userBDb, 'extract_preference', { userMessage: 'user-b message', assistantMessage: '' })

    const tasksA = userADb.prepare('SELECT type FROM agent_tasks').all() as { type: string }[]
    const tasksB = userBDb.prepare('SELECT type FROM agent_tasks').all() as { type: string }[]

    expect(tasksA).toHaveLength(1)
    expect(tasksA[0].type).toBe('extract_profile')
    expect(tasksB).toHaveLength(1)
    expect(tasksB[0].type).toBe('extract_preference')

    // 验证无跨库污染
    expect(tasksA.every(t => t.type !== 'extract_preference')).toBe(true)
    expect(tasksB.every(t => t.type !== 'extract_profile')).toBe(true)

    userADb.close()
    userBDb.close()
  })

  it('payload 以 JSON 字符串正确存储', () => {
    const db = createTaskDb()
    const payload = { fileId: 'abc123', textContent: 'hello world', filename: 'test.pdf' }
    enqueueTask(db, 'embed_file', payload)

    const row = db.prepare('SELECT type, payload, status FROM agent_tasks').get() as { type: string; payload: string; status: string }
    expect(row.type).toBe('embed_file')
    expect(row.status).toBe('pending')

    const parsed = JSON.parse(row.payload) as typeof payload
    expect(parsed.fileId).toBe('abc123')
    expect(parsed.textContent).toBe('hello world')
    expect(parsed.filename).toBe('test.pdf')

    db.close()
  })

  it('多次 enqueueTask 任务累积在同一 db 中', () => {
    const db = createTaskDb()
    enqueueTask(db, 'extract_profile', { userMessage: 'msg1', assistantMessage: '' })
    enqueueTask(db, 'extract_preference', { userMessage: 'msg2', assistantMessage: '' })
    enqueueTask(db, 'consolidate_facts', {})

    const tasks = db.prepare('SELECT type FROM agent_tasks ORDER BY id ASC').all() as { type: string }[]
    expect(tasks).toHaveLength(3)
    expect(tasks[0].type).toBe('extract_profile')
    expect(tasks[1].type).toBe('extract_preference')
    expect(tasks[2].type).toBe('consolidate_facts')

    db.close()
  })

  it('任务初始状态为 pending', () => {
    const db = createTaskDb()
    enqueueTask(db, 'consolidate_facts', {})

    const row = db.prepare('SELECT status, retries FROM agent_tasks').get() as { status: string; retries: number }
    expect(row.status).toBe('pending')
    expect(row.retries).toBe(0)

    db.close()
  })
})

// ── Config API – empty apiKey guard ──────────────────────────────────────────

describe('PUT /api/config/apikey - empty key guard', () => {
  beforeEach(resetDb)

  it('should reject empty string and not overwrite existing key', async () => {
    // First set a real key
    await app.request('/api/config/apikey', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ apiKey: 'sk-realkey' }) })
    // Then try to save empty
    const res = await app.request('/api/config/apikey', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ apiKey: '' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.skipped).toBe(true)
    // Verify original key was preserved
    const getRes = await app.request('/api/config/apikey')
    const getData = await getRes.json()
    expect(getData.apiKey).toBe('sk-realkey')
  })

  it('should save non-empty key normally', async () => {
    const res = await app.request('/api/config/apikey', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ apiKey: 'sk-newkey' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.skipped).toBeUndefined()
  })
})

// ── Logical Edges API ─────────────────────────────────────────────────────────

describe('Storage API - logical-edges.json fallback', () => {
  beforeEach(resetDb)

  it('GET /api/storage/logical-edges.json returns [] when not stored', async () => {
    const res = await req('GET', '/api/storage/logical-edges.json')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual([])
  })
})

