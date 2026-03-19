import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

vi.mock('../agentWorker', () => ({
  enqueueTask: vi.fn(),
}))

vi.mock('../lib/embedding', () => ({
  fetchEmbedding: vi.fn().mockResolvedValue(null),
  vecToBuffer: vi.fn(() => Buffer.alloc(0)),
  bufferToVec: vi.fn(() => new Float32Array()),
  cosineSim: vi.fn(() => 0),
}))

import { memoryRoutes } from '../routes/memory'

const testDb = new Database(':memory:')

testDb.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS storage (
    filename   TEXT PRIMARY KEY,
    content    TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    conversation_id TEXT PRIMARY KEY,
    vector          BLOB NOT NULL,
    dim             INTEGER NOT NULL,
    updated_at      TEXT NOT NULL
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
`)

function buildApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    ;(c as any).set('db', testDb)
    await next()
  })
  app.route('/api/memory', memoryRoutes)
  return app
}

function getStorageContent(filename: string): string {
  const row = testDb.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as { content: string } | undefined
  return row?.content ?? ''
}

function getConfigValue(key: string): string | null {
  const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

async function flushMicrotasks(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('memoryRoutes /sync-lenny-conv', () => {
  beforeEach(async () => {
    await flushMicrotasks(5)
    testDb.exec(`
      DELETE FROM config;
      DELETE FROM storage;
      DELETE FROM embeddings;
      DELETE FROM agent_tasks;
    `)
  })

  afterAll(() => {
    testDb.close()
  })

  it('uses lightweight id index to avoid duplicate conversation writes', async () => {
    const app = buildApp()
    const payload = {
      conversationId: 'conv-1',
      userMessage: '测试一个灵思决策问题',
      assistantMessage: '这是一次带结论的回答',
      source: 'lenny',
    }

    const first = await app.request('/api/memory/sync-lenny-conv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const second = await app.request('/api/memory/sync-lenny-conv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const conversations = getStorageContent('conversations.jsonl').trim().split('\n').filter(Boolean)
    expect(conversations).toHaveLength(1)
    expect(JSON.parse(conversations[0])).toMatchObject({ id: 'lenny-conv-1', source: 'lenny' })

    const syncIndex = JSON.parse(getConfigValue('main_space_sync_id_index_v1') ?? '{}') as Record<string, boolean>
    expect(syncIndex['lenny-conv-1']).toBe(true)
  })

  it('generates nodes asynchronously without blocking the response', async () => {
    const app = buildApp()
    const response = await app.request('/api/memory/sync-lenny-conv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conv-2',
        userMessage: '帮我判断这个产品方向值不值得继续',
        assistantMessage: '建议继续，但先验证需求强度。',
        source: 'zhang',
      }),
    })

    expect(response.status).toBe(200)
    expect(getStorageContent('nodes.json')).toBe('')

    await flushMicrotasks()

    const nodes = JSON.parse(getStorageContent('nodes.json')) as Array<{ id: string; conversationId: string }>
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ id: 'zhang-conv-2', conversationId: 'zhang-conv-2' })

    const nodeIndex = JSON.parse(getConfigValue('main_space_node_id_index_v1') ?? '{}') as Record<string, boolean>
    expect(nodeIndex['zhang-conv-2']).toBe(true)
  })
})
