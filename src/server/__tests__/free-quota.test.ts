import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'

type ClientModule = typeof import('../lib/aiClient')

let tmpDir: string
let client: ClientModule
let savedEnv: Record<string, string | undefined>
const ENV_KEYS = ['DATA_DIR', 'AI_FREE_ONLY']

const cfg = {
  apiKey: 'sk-or-fake-quota-test',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'dots-studio/dots-3-note-preview:free',
  managedFree: true,
  usingSharedKey: false
}

async function loadClient(): Promise<ClientModule> {
  vi.resetModules()
  return await import('../lib/aiClient')
}

function seedRequests(count: number, startedAt: number) {
  const dbPath = path.join(tmpDir, 'usage-ledger.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS free_ai_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      started_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS free_ai_requests_day ON free_ai_requests(day);
  `)
  const ins = db.prepare('INSERT INTO free_ai_requests(day, started_at) VALUES (?, ?)')
  for (let i = 0; i < count; i++) {
    ins.run(new Date(startedAt - i).toISOString().slice(0, 10), startedAt - i)
  }
  db.close()
}

beforeEach(async () => {
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-quota-test-'))
  process.env.DATA_DIR = tmpDir
  process.env.AI_FREE_ONLY = 'true'
  client = await loadClient()
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function okResponse(): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
}

const BODY = { messages: [{ role: 'user', content: 'hi' }] }

describe('free request quota', () => {
  it('当日已有 40 次记录后，下一次在 fetch 前拒绝', async () => {
    seedRequests(40, Date.now() - 61_000)
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('当日 39 条历史后，第 40 次放行、第 41 次拒', async () => {
    seedRequests(39, Date.now() - 61_000)
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { res, release } = await client.upstreamChat(cfg, BODY)
    expect(res.status).toBe(200)
    release()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('一分钟内第 11 次被拒（滚动窗口）', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < 10; i++) {
      const { release } = await client.upstreamChat(cfg, BODY)
      release()
    }
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })

  it('UTC 跨天：历史记录落在前一 UTC 日不计入今日', async () => {
    const yesterday = Date.now() - 26 * 60 * 60 * 1000
    seedRequests(40, yesterday)
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { res, release } = await client.upstreamChat(cfg, BODY)
    expect(res.status).toBe(200)
    release()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('同一 DATA_DIR 重启后计数持久', async () => {
    seedRequests(40, Date.now() - 61_000)
    ;(await import('../usageBudget')).closeLedger()
    client = await loadClient()
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('两个独立账本实例共享 DATA_DIR：最后一格额度不会被双花', async () => {
    seedRequests(39, Date.now() - 61_000)
    const clientB = await loadClient()
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { res, release } = await client.upstreamChat(cfg, BODY)
    expect(res.status).toBe(200)
    release()
    const [a, b] = await Promise.allSettled([
      clientB.upstreamChat(cfg, BODY),
      clientB.upstreamChat(cfg, BODY)
    ])
    const rejected = [a, b].filter(r => r.status === 'rejected')
    expect(rejected.length).toBeGreaterThan(0)
  })

  it('两个并发占用时第三个请求立即拒；流 EOF 消费后 release 放行', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {}\n\n'))
          controller.close()
        }
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const p1 = await client.upstreamChat(cfg, BODY)
    const p2 = await client.upstreamChat(cfg, BODY)
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const reader = p1.res.body!.getReader()
    while (!(await reader.read()).done) { }
    reader.releaseLock()
    p1.release()
    const { res: res3, release: release3 } = await client.upstreamChat(cfg, BODY)
    expect(res3.status).toBe(200)
    release3()
    await p2.res.body!.cancel()
    p2.release()
  })

  it('账本 DB 故障时 fail-closed（不 fetch）', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    fs.writeFileSync(path.join(tmpDir, 'usage-ledger.db'), 'not a sqlite file')
    client = await loadClient()
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('失败的尝试同样计入配额（不退款）', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < 10; i++) {
      const { res, release } = await client.upstreamChat(cfg, BODY)
      expect(res.status).toBe(500)
      release()
    }
    await expect(client.upstreamChat(cfg, BODY)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })
})
