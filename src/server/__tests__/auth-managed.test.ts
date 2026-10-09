import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-auth-managed-'))

let authMiddleware: MiddlewareHandler
let isAuthRequired: () => boolean
let app: InstanceType<typeof Hono>
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = ['DATA_DIR', 'ACCESS_TOKEN', 'ACCESS_TOKENS', 'AUTH_DISABLED', 'AI_FREE_ONLY', 'OPENROUTER_API_KEY', 'openrouter_apikey', 'NODE_ENV']

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  process.env.DATA_DIR = tmpDataDir
  vi.resetModules()
  const mod = await import('../middleware/auth')
  authMiddleware = mod.authMiddleware
  isAuthRequired = mod.isAuthRequired
  const a = new Hono()
  a.use('/api/*', authMiddleware)
  a.get('/api/x', (c) => c.json({ ok: true }))
  app = a
})

beforeEach(() => {
  delete process.env.ACCESS_TOKEN
  delete process.env.ACCESS_TOKENS
  delete process.env.AUTH_DISABLED
  delete process.env.AI_FREE_ONLY
  delete process.env.OPENROUTER_API_KEY
  delete process.env.openrouter_apikey
  delete process.env.NODE_ENV
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function req(token?: string, method = 'GET') {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`
  return app.request('/api/x', { method, headers })
}

describe('managed/production fail-closed auth', () => {
  it('managed free + 无配置 token → 401（不开门）', async () => {
    process.env.AI_FREE_ONLY = 'true'
    process.env.OPENROUTER_API_KEY = 'sk-or-fake'
    expect(isAuthRequired()).toBe(true)
    const res = await req()
    expect(res.status).toBe(401)
  })

  it('AUTH_DISABLED=true 不能绕过 managed free 鉴权', async () => {
    process.env.AI_FREE_ONLY = 'true'
    process.env.OPENROUTER_API_KEY = 'sk-or-fake'
    process.env.AUTH_DISABLED = 'true'
    expect(isAuthRequired()).toBe(true)
    const res = await req()
    expect(res.status).toBe(401)
  })

  it('NODE_ENV=production + 无 token → 401', async () => {
    process.env.NODE_ENV = 'production'
    expect(isAuthRequired()).toBe(true)
    const res = await req()
    expect(res.status).toBe(401)
  })

  it('managed free 下白名单 token 放行、错误 token 401', async () => {
    process.env.AI_FREE_ONLY = 'true'
    process.env.OPENROUTER_API_KEY = 'sk-or-fake'
    process.env.ACCESS_TOKENS = 'tok-valid-aaa,tok-valid-bbb'
    expect((await req('tok-valid-aaa')).status).toBe(200)
    expect((await req('tok-valid-bbb')).status).toBe(200)
    expect((await req('tok-wrong')).status).toBe(401)
    expect((await req()).status).toBe(401)
  })

  it('OPTIONS 预检放行（managed free）', async () => {
    process.env.AI_FREE_ONLY = 'true'
    process.env.OPENROUTER_API_KEY = 'sk-or-fake'
    const res = await req(undefined, 'OPTIONS')
    expect(res.status).not.toBe(401)
  })

  it('开发模式（非 managed、非 production）：无 token 时开放', async () => {
    expect(isAuthRequired()).toBe(false)
    const res = await req()
    expect(res.status).toBe(200)
  })

  it('AUTH_DISABLED=true 在纯开发模式仍可放行（非 managed 兼容）', async () => {
    process.env.AUTH_DISABLED = 'true'
    expect(isAuthRequired()).toBe(false)
    const res = await req()
    expect(res.status).toBe(200)
  })
})
