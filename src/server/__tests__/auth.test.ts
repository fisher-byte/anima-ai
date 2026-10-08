/**
 * auth middleware 单元测试（真实中间件，非内联拷贝）
 *
 * 验证 ACCESS_TOKEN / ACCESS_TOKENS 白名单模式与 AUTH_DISABLED / 开放回退：
 *   - 配置了 token → Bearer 必须在白名单内，否则 401（随机字符串也拒绝）
 *   - 未配置 token 且未禁用 → 开放（本地开发兼容）
 *   - AUTH_DISABLED=true → 始终开放
 *   - OPTIONS 预检一律放行（CORS）
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

// auth.ts → db.ts 在 import 时会创建 DATA_DIR 与默认 db；先指向临时目录隔离
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-auth-test-'))

let authMiddleware: MiddlewareHandler

type TestEnv = { Variables: { userId?: string } }

let app: InstanceType<typeof Hono<TestEnv>>

beforeAll(async () => {
  process.env.DATA_DIR = tmpDataDir
  vi.resetModules()
  ;({ authMiddleware } = await import('../middleware/auth'))

  const a = new Hono<TestEnv>()
  a.use('/api/*', authMiddleware)
  a.get('/api/x', (c) => c.json({ ok: true, userId: c.get('userId') ?? null }))
  app = a
})

function get(path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`
  return app.fetch(new Request(`http://localhost${path}`, { headers }))
}

function options(path: string) {
  return app.fetch(new Request(`http://localhost${path}`, { method: 'OPTIONS' }))
}

const SAVED = {
  ACCESS_TOKEN: process.env.ACCESS_TOKEN,
  ACCESS_TOKENS: process.env.ACCESS_TOKENS,
  AUTH_DISABLED: process.env.AUTH_DISABLED
}

beforeEach(() => {
  delete process.env.ACCESS_TOKEN
  delete process.env.ACCESS_TOKENS
  delete process.env.AUTH_DISABLED
})

afterAll(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else process.env[k] = v
  }
  delete process.env.DATA_DIR
  fs.rmSync(tmpDataDir, { recursive: true, force: true })
})

describe('开放模式（未配置 token）', () => {
  it('无 token 请求放行', async () => {
    const res = await get('/api/x')
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('携带任意 Bearer 仍放行并映射 userId', async () => {
    const res = await get('/api/x', 'any-random-uuid')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.userId).toBe('string')
  })
})

describe('白名单模式（成员资格校验）', () => {
  it('ACCESS_TOKEN 命中放行，缺失/错误 401', async () => {
    process.env.ACCESS_TOKEN = 'secret-1'
    expect((await get('/api/x')).status).toBe(401)
    expect((await get('/api/x', 'wrong')).status).toBe(401)
    const res = await get('/api/x', 'secret-1')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.userId).toBeTruthy()
  })

  it('ACCESS_TOKENS 逗号列表中任一 token 放行', async () => {
    process.env.ACCESS_TOKENS = 't-aaa, t-bbb ,,t-ccc'
    expect((await get('/api/x', 't-bbb')).status).toBe(200)
    expect((await get('/api/x', 't-ccc')).status).toBe(200)
    expect((await get('/api/x', 't-ddd')).status).toBe(401)
  })

  it('ACCESS_TOKEN 与 ACCESS_TOKENS 并集生效', async () => {
    process.env.ACCESS_TOKEN = 'single'
    process.env.ACCESS_TOKENS = 'multi-1,multi-2'
    expect((await get('/api/x', 'single')).status).toBe(200)
    expect((await get('/api/x', 'multi-2')).status).toBe(200)
    expect((await get('/api/x', 'nope')).status).toBe(401)
  })

  it('随机 Bearer token 不在白名单 → 401', async () => {
    process.env.ACCESS_TOKENS = 'real-token'
    const res = await get('/api/x', 'minted-by-attacker')
    expect(res.status).toBe(401)
  })

  it('空 Bearer（"Bearer "）→ 401', async () => {
    process.env.ACCESS_TOKEN = 'secret-1'
    const res = await get('/api/x', '')
    expect(res.status).toBe(401)
  })

  it('401 响应为 JSON {error: "Unauthorized"}', async () => {
    process.env.ACCESS_TOKEN = 'secret-1'
    const res = await get('/api/x')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('OPTIONS 预检请求始终放行', async () => {
    process.env.ACCESS_TOKEN = 'secret-1'
    // 注意：测试 app 未注册 OPTIONS 路由，中间件放行后由 Hono 返回 404/405 —— 只要不是 401 即视为通过
    const res = await options('/api/x')
    expect(res.status).not.toBe(401)
  })
})

describe('AUTH_DISABLED', () => {
  it('AUTH_DISABLED=true 时即使配置了 token 也放行', async () => {
    process.env.AUTH_DISABLED = 'true'
    process.env.ACCESS_TOKENS = 't-aaa'
    expect((await get('/api/x')).status).toBe(200)
    expect((await get('/api/x', 't-aaa')).status).toBe(200)
    expect((await get('/api/x', 'anything')).status).toBe(200)
  })
})
