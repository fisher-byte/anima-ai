/**
 * Memory Routes Integration Tests
 *
 * Tests profile CRUD, facts CRUD, classify + extract stubs,
 * and the queue endpoint using an in-memory SQLite database.
 *
 * NOTE: /api/memory/classify and /api/memory/extract require a live API key;
 * those tests verify the "no-key" fallback path only.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

// ── In-memory DB setup ─────────────────────────────────────────────────────

const testDb = new Database(':memory:')
testDb.pragma('journal_mode = WAL')
testDb.pragma('foreign_keys = ON')

testDb.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    conversation_id TEXT PRIMARY KEY,
    vector          BLOB NOT NULL,
    dim             INTEGER NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    occupation    TEXT,
    interests     TEXT,
    tools         TEXT,
    writing_style TEXT,
    goals         TEXT,
    location      TEXT,
    raw_notes     TEXT,
    last_extracted TEXT,
    updated_at    TEXT NOT NULL
  );

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
  );

  CREATE TABLE IF NOT EXISTS memory_facts (
    id             TEXT NOT NULL,
    fact           TEXT NOT NULL,
    source_conv_id TEXT,
    created_at     TEXT NOT NULL,
    invalid_at     TEXT,
    PRIMARY KEY(id)
  );

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id           TEXT NOT NULL,
    filename     TEXT NOT NULL,
    mimetype     TEXT NOT NULL DEFAULT '',
    size         INTEGER NOT NULL DEFAULT 0,
    content      BLOB,
    text_content TEXT,
    conv_id      TEXT,
    chunk_count  INTEGER NOT NULL DEFAULT 0,
    embed_status TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    PRIMARY KEY(id)
  );

  CREATE TABLE IF NOT EXISTS file_embeddings (
    id          TEXT NOT NULL,
    file_id     TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text  TEXT NOT NULL,
    vector      BLOB NOT NULL,
    dim         INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY(id)
  );
`)

function resetDb() {
  testDb.exec(`
    DELETE FROM user_profile;
    DELETE FROM memory_facts;
    DELETE FROM agent_tasks;
    DELETE FROM embeddings;
    DELETE FROM config;
  `)
}

afterAll(() => { testDb.close() })

// ── Build test app (inline routes that use testDb) ─────────────────────────

function buildMemoryApp() {
  const app = new Hono()

  // ── helpers ────────────────────────────────────────────────────────────
  function getApiConfig() {
    const keyRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as { value: string } | undefined
    const urlRow = testDb.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as { value: string } | undefined
    return {
      apiKey: keyRow?.value ?? '',
      baseUrl: (urlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')
    }
  }

  // ── profile ────────────────────────────────────────────────────────────

  app.get('/api/memory/profile', (c) => {
    const row = testDb.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string> | undefined
    if (!row) return c.json({})
    const safeParseArr = (v: string | undefined): string[] => {
      if (!v) return []
      try { return JSON.parse(v) as string[] } catch { return [] }
    }
    return c.json({
      occupation: row.occupation ?? null,
      interests: safeParseArr(row.interests),
      tools: safeParseArr(row.tools),
      writingStyle: row.writing_style ?? null,
      goals: safeParseArr(row.goals),
      location: row.location ?? null,
      rawNotes: row.raw_notes ?? null,
    })
  })

  app.put('/api/memory/profile', async (c) => {
    const body = await c.req.json<{
      occupation?: string; interests?: string[]; tools?: string[];
      writingStyle?: string; goals?: string[]; location?: string; rawNotes?: string
    }>()
    const now = new Date().toISOString()
    const existing = testDb.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined

    if (!existing) {
      testDb.prepare(`
        INSERT INTO user_profile (id, occupation, interests, tools, writing_style, goals, location, raw_notes, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.occupation ?? null,
        body.interests ? JSON.stringify(body.interests) : null,
        body.tools ? JSON.stringify(body.tools) : null,
        body.writingStyle ?? null,
        body.goals ? JSON.stringify(body.goals) : null,
        body.location ?? null,
        body.rawNotes ?? null,
        now
      )
    } else {
      const mergeJson = (e: string | null, incoming?: string[]) => {
        if (!incoming) return e
        const base: string[] = e ? JSON.parse(e) : []
        return JSON.stringify([...new Set([...base, ...incoming])])
      }
      testDb.prepare(`
        UPDATE user_profile SET
          occupation    = COALESCE(?, occupation),
          interests     = ?,
          tools         = ?,
          writing_style = COALESCE(?, writing_style),
          goals         = ?,
          location      = COALESCE(?, location),
          raw_notes     = COALESCE(?, raw_notes),
          updated_at    = ?
        WHERE id = 1
      `).run(
        body.occupation ?? null,
        mergeJson(existing.interests as string | null, body.interests),
        mergeJson(existing.tools as string | null, body.tools),
        body.writingStyle ?? null,
        mergeJson(existing.goals as string | null, body.goals),
        body.location ?? null,
        body.rawNotes ?? null,
        now
      )
    }
    return c.json({ ok: true })
  })

  app.delete('/api/memory/profile', (c) => {
    const now = new Date().toISOString()
    const existing = testDb.prepare('SELECT id FROM user_profile WHERE id = 1').get()
    if (existing) {
      testDb.prepare(`
        UPDATE user_profile SET
          occupation = NULL, interests = NULL, tools = NULL,
          writing_style = NULL, goals = NULL, location = NULL,
          raw_notes = NULL, last_extracted = NULL, updated_at = ?
        WHERE id = 1
      `).run(now)
    }
    return c.json({ ok: true })
  })

  // ── facts ──────────────────────────────────────────────────────────────

  app.get('/api/memory/facts', (c) => {
    const rows = testDb.prepare(
      'SELECT id, fact, source_conv_id, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 200'
    ).all() as { id: string; fact: string; source_conv_id: string | null; created_at: string }[]
    return c.json({ facts: rows })
  })

  app.delete('/api/memory/facts/:id', (c) => {
    const id = c.req.param('id')
    testDb.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    return c.json({ ok: true })
  })

  app.delete('/api/memory/facts', (c) => {
    testDb.prepare('UPDATE memory_facts SET invalid_at = ?').run(new Date().toISOString())
    return c.json({ ok: true })
  })

  // ── queue ──────────────────────────────────────────────────────────────

  app.post('/api/memory/queue', async (c) => {
    const { type, payload } = await c.req.json<{ type: string; payload: Record<string, unknown> }>()
    if (!type) return c.json({ error: 'type required' }, 400)
    testDb.prepare(`
      INSERT INTO agent_tasks (type, payload, created_at)
      VALUES (?, ?, ?)
    `).run(type, JSON.stringify(payload ?? {}), new Date().toISOString())
    return c.json({ ok: true })
  })

  // ── classify (no-key stub) ─────────────────────────────────────────────

  app.post('/api/memory/classify', async (c) => {
    const { text } = await c.req.json<{ text: string }>()
    if (!text?.trim()) return c.json({ category: null })
    const { apiKey } = getApiConfig()
    if (!apiKey) return c.json({ category: null })
    return c.json({ category: '其他' })  // stub: real route calls AI
  })

  // ── extract (no-key stub) ──────────────────────────────────────────────

  app.post('/api/memory/extract', async (c) => {
    const { userMessage } = await c.req.json<{ userMessage: string }>()
    if (!userMessage?.trim()) return c.json({ ok: false, reason: 'userMessage required' })
    const { apiKey } = getApiConfig()
    if (!apiKey) return c.json({ ok: false, reason: 'no api key' })
    return c.json({ ok: true, extracted: 0 })  // stub: real route calls AI
  })

  // ── index (for embedding tests) ────────────────────────────────────────

  app.delete('/api/memory/index', (c) => {
    testDb.prepare('DELETE FROM embeddings').run()
    return c.json({ ok: true })
  })

  app.delete('/api/memory/index/:id', (c) => {
    const id = c.req.param('id')
    testDb.prepare('DELETE FROM embeddings WHERE conversation_id = ?').run(id)
    return c.json({ ok: true })
  })

  return app
}

const app = buildMemoryApp()

async function req(
  method: string,
  path: string,
  opts: { json?: unknown } = {}
) {
  const headers = new Headers()
  let body: string | undefined
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(opts.json)
  }
  return app.fetch(new Request(`http://localhost${path}`, { method, headers, body }))
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('User Profile API', () => {
  beforeEach(resetDb)

  it('GET /api/memory/profile returns empty object when no profile', async () => {
    const res = await req('GET', '/api/memory/profile')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('PUT /api/memory/profile creates new profile', async () => {
    const res = await req('PUT', '/api/memory/profile', {
      json: { occupation: '工程师', interests: ['编程', 'AI'], tools: ['VSCode'] }
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    const getRes = await req('GET', '/api/memory/profile')
    const data = await getRes.json() as any
    expect(data.occupation).toBe('工程师')
    expect(data.interests).toContain('编程')
    expect(data.interests).toContain('AI')
  })

  it('PUT /api/memory/profile merges interests on second update', async () => {
    await req('PUT', '/api/memory/profile', { json: { interests: ['编程'] } })
    await req('PUT', '/api/memory/profile', { json: { interests: ['AI', '编程'] } })

    const getRes = await req('GET', '/api/memory/profile')
    const data = await getRes.json() as any
    // merged: 编程 appears once, AI appears
    const unique = [...new Set(data.interests)]
    expect(unique).toContain('编程')
    expect(unique).toContain('AI')
    // no duplicates
    expect(data.interests.filter((x: string) => x === '编程').length).toBe(1)
  })

  it('PUT /api/memory/profile merges tools array', async () => {
    await req('PUT', '/api/memory/profile', { json: { tools: ['VSCode'] } })
    await req('PUT', '/api/memory/profile', { json: { tools: ['Cursor'] } })

    const getRes = await req('GET', '/api/memory/profile')
    const data = await getRes.json() as any
    expect(data.tools).toContain('VSCode')
    expect(data.tools).toContain('Cursor')
  })

  it('PUT /api/memory/profile overwrites scalar fields (COALESCE)', async () => {
    await req('PUT', '/api/memory/profile', { json: { occupation: 'Designer' } })
    await req('PUT', '/api/memory/profile', { json: { occupation: 'Engineer' } })

    const data = await (await req('GET', '/api/memory/profile')).json() as any
    expect(data.occupation).toBe('Engineer')
  })

  it('DELETE /api/memory/profile clears all fields', async () => {
    await req('PUT', '/api/memory/profile', {
      json: { occupation: '工程师', interests: ['AI'] }
    })
    await req('DELETE', '/api/memory/profile')

    const data = await (await req('GET', '/api/memory/profile')).json() as any
    // After clear, all fields should be null/empty
    expect(data.occupation).toBeNull()
    expect(data.interests).toEqual([])
  })
})

describe('Memory Facts API', () => {
  beforeEach(resetDb)

  function insertFact(fact: string, convId?: string) {
    testDb.prepare(`
      INSERT INTO memory_facts (id, fact, source_conv_id, created_at)
      VALUES (lower(hex(randomblob(8))), ?, ?, ?)
    `).run(fact, convId ?? null, new Date().toISOString())
  }

  it('GET /api/memory/facts returns empty list initially', async () => {
    const res = await req('GET', '/api/memory/facts')
    const data = await res.json() as any
    expect(res.status).toBe(200)
    expect(data.facts).toEqual([])
  })

  it('GET /api/memory/facts returns active facts', async () => {
    insertFact('用户是工程师', 'c1')
    insertFact('用户喜欢咖啡', 'c2')
    const data = await (await req('GET', '/api/memory/facts')).json() as any
    expect(data.facts.length).toBe(2)
    expect(data.facts.map((f: any) => f.fact)).toContain('用户是工程师')
  })

  it('GET /api/memory/facts excludes soft-deleted facts', async () => {
    insertFact('should be visible')
    const row = testDb.prepare('SELECT id FROM memory_facts').get() as { id: string }
    testDb.prepare('UPDATE memory_facts SET invalid_at = ? WHERE id = ?')
      .run(new Date().toISOString(), row.id)

    const data = await (await req('GET', '/api/memory/facts')).json() as any
    expect(data.facts.length).toBe(0)
  })

  it('DELETE /api/memory/facts/:id soft-deletes a specific fact', async () => {
    insertFact('fact to delete')
    const row = testDb.prepare('SELECT id FROM memory_facts').get() as { id: string }

    const res = await req('DELETE', `/api/memory/facts/${row.id}`)
    expect((await res.json() as any).ok).toBe(true)

    // Still in DB but with invalid_at set
    const updated = testDb.prepare('SELECT invalid_at FROM memory_facts WHERE id = ?').get(row.id) as any
    expect(updated.invalid_at).not.toBeNull()

    // Not returned by GET
    const data = await (await req('GET', '/api/memory/facts')).json() as any
    expect(data.facts.length).toBe(0)
  })

  it('DELETE /api/memory/facts bulk-soft-deletes all facts', async () => {
    insertFact('fact1')
    insertFact('fact2')
    insertFact('fact3')

    const res = await req('DELETE', '/api/memory/facts')
    expect((await res.json() as any).ok).toBe(true)

    const data = await (await req('GET', '/api/memory/facts')).json() as any
    expect(data.facts.length).toBe(0)

    // Records still in DB (soft delete)
    const count = (testDb.prepare('SELECT count(*) as n FROM memory_facts').get() as { n: number }).n
    expect(count).toBe(3)
  })
})

describe('Memory Queue API', () => {
  beforeEach(resetDb)

  it('POST /api/memory/queue enqueues a task', async () => {
    const res = await req('POST', '/api/memory/queue', {
      json: { type: 'embed_file', payload: { fileId: 'f1' } }
    })
    expect(res.status).toBe(200)
    expect((await res.json() as any).ok).toBe(true)

    const task = testDb.prepare('SELECT * FROM agent_tasks').get() as any
    expect(task.type).toBe('embed_file')
    expect(JSON.parse(task.payload).fileId).toBe('f1')
    expect(task.status).toBe('pending')
  })

  it('POST /api/memory/queue returns 400 when type missing', async () => {
    const res = await req('POST', '/api/memory/queue', { json: { payload: {} } })
    expect(res.status).toBe(400)
  })
})

describe('Memory Classify API (no-key fallback)', () => {
  beforeEach(resetDb)

  it('returns null category when no API key configured', async () => {
    const res = await req('POST', '/api/memory/classify', { json: { text: '你好' } })
    expect(res.status).toBe(200)
    expect((await res.json() as any).category).toBeNull()
  })

  it('returns null category for empty text', async () => {
    const res = await req('POST', '/api/memory/classify', { json: { text: '' } })
    expect((await res.json() as any).category).toBeNull()
  })
})

describe('Memory Extract API (no-key fallback)', () => {
  beforeEach(resetDb)

  it('returns error when userMessage empty', async () => {
    const res = await req('POST', '/api/memory/extract', {
      json: { userMessage: '', assistantMessage: 'ok' }
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.reason).toBe('userMessage required')
  })

  it('returns no-key error when API key not set', async () => {
    const res = await req('POST', '/api/memory/extract', {
      json: { userMessage: '我是工程师' }
    })
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.reason).toBe('no api key')
  })
})

describe('Embedding Index API', () => {
  beforeEach(resetDb)

  it('DELETE /api/memory/index clears all embeddings', async () => {
    testDb.prepare(`
      INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
      VALUES ('c1', zeroblob(16), 4, '2026-01-01')
    `).run()

    const res = await req('DELETE', '/api/memory/index')
    expect((await res.json() as any).ok).toBe(true)

    const count = (testDb.prepare('SELECT count(*) as n FROM embeddings').get() as { n: number }).n
    expect(count).toBe(0)
  })

  it('DELETE /api/memory/index/:id removes a specific embedding', async () => {
    testDb.prepare(`
      INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
      VALUES ('c1', zeroblob(16), 4, '2026-01-01')
    `).run()

    await req('DELETE', '/api/memory/index/c1')
    const count = (testDb.prepare('SELECT count(*) as n FROM embeddings').get() as { n: number }).n
    expect(count).toBe(0)
  })
})
