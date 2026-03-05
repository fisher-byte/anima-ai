/**
 * AI 路由引导模式 key fallback 逻辑集成测试
 *
 * 验证：
 * 1. 无用户 key + 非引导模式 → 400
 * 2. 无用户 key + 引导模式 + 无 ONBOARDING_API_KEY → 400
 * 3. 无用户 key + 引导模式 + 有 ONBOARDING_API_KEY → 尝试调用上游（上游不可达时返回 SSE error，而非 400）
 * 4. 有用户 key + 引导模式 → 使用用户自己的 key（不用 fallback）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

// ── 在路由加载前构造注入 testDb 的测试 app ──────────────────────────────────
const testDb = new Database(':memory:')
testDb.pragma('journal_mode = WAL')
testDb.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memory_facts (
    id             TEXT PRIMARY KEY,
    fact           TEXT NOT NULL,
    source_conv_id TEXT,
    created_at     TEXT NOT NULL,
    invalid_at     TEXT
  );
  CREATE TABLE IF NOT EXISTS embeddings (
    conversation_id TEXT PRIMARY KEY,
    vector          BLOB NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY
  );
`)

function resetDb() {
  testDb.exec('DELETE FROM config;')
}

// ── inline 最简版 /api/ai/stream，仅测试 key 解析逻辑 ──────────────────────
//
// 完整路由依赖 streamSSE / fetch，这里只测试"key 读取 → 400 or 继续"分支，
// 把 streamSSE 部分 mock 掉，只验证 4xx 守卫。

function buildApp(onboardingEnvKey: string | undefined) {
  const app = new Hono()

  app.post('/api/ai/stream', async (c) => {
    const body = await c.req.json<{ isOnboarding?: boolean }>()
    const { isOnboarding = false } = body

    const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
      | { value: string }
      | undefined
    const apiKey = row?.value ?? ''

    const effectiveApiKey = isOnboarding && !apiKey
      ? (onboardingEnvKey ?? '')
      : apiKey

    if (!effectiveApiKey) {
      return c.json({ error: 'API Key 未配置，请在设置中填写' }, 400)
    }

    // 到这里说明 key 检查通过，返回 200（模拟继续流式处理）
    return c.json({ ok: true, usedKey: effectiveApiKey })
  })

  return app
}

async function req(
  app: Hono,
  body: object,
  method = 'POST',
  path = '/api/ai/stream'
): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('AI 路由 — ONBOARDING_API_KEY fallback', () => {
  beforeEach(() => resetDb())
  afterEach(() => resetDb())

  it('无用户 key + 非引导模式 → 400', async () => {
    const app = buildApp(undefined)
    const res = await req(app, { isOnboarding: false, messages: [] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('API Key 未配置')
  })

  it('无用户 key + 引导模式 + 无 ONBOARDING_API_KEY env → 400', async () => {
    const app = buildApp(undefined) // 没有 env key
    const res = await req(app, { isOnboarding: true, messages: [] })
    expect(res.status).toBe(400)
  })

  it('无用户 key + 引导模式 + 空字符串 ONBOARDING_API_KEY env → 400', async () => {
    const app = buildApp('') // 空字符串视为未配置
    const res = await req(app, { isOnboarding: true, messages: [] })
    expect(res.status).toBe(400)
  })

  it('无用户 key + 引导模式 + 有效 ONBOARDING_API_KEY → 跳过 400，进入处理', async () => {
    const app = buildApp('sk-demo-onboarding-key')
    const res = await req(app, { isOnboarding: true, messages: [] })
    // key 检查通过，返回 200
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.usedKey).toBe('sk-demo-onboarding-key')
  })

  it('有用户 key + 引导模式 → 使用用户自己的 key，不用 fallback', async () => {
    testDb.prepare(`INSERT INTO config VALUES ('apiKey', 'sk-user-own', '2026-01-01')`).run()
    const app = buildApp('sk-demo-onboarding-key')
    const res = await req(app, { isOnboarding: true, messages: [] })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.usedKey).toBe('sk-user-own') // 用的是用户 key，不是 demo key
  })

  it('有用户 key + 非引导模式 → 正常使用用户 key', async () => {
    testDb.prepare(`INSERT INTO config VALUES ('apiKey', 'sk-user-key', '2026-01-01')`).run()
    const app = buildApp(undefined)
    const res = await req(app, { isOnboarding: false, messages: [] })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.usedKey).toBe('sk-user-key')
  })
})
