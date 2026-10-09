import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-managed-test-'))
const FAKE_ENV_KEY = 'sk-or-fake-env-test-key-0000'
const FAKE_STORED_KEY = 'sk-stored-evil-must-never-leak-1111'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = ['DATA_DIR', 'AI_FREE_ONLY', 'OPENROUTER_API_KEY', 'MOONSHOT_API_KEY', 'KIMI_API_KEY', 'BUILTIN_EMBED_API_KEY', 'DASHSCOPE_API_KEY']

interface FetchCall { url: string; init: RequestInit; body: Record<string, unknown> }
const fetchCalls: FetchCall[] = []

function sseResponse(text: string): Response {
  const chunks = [
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] }
  ]
  const payload = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(payload, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  })
}

function jsonChatResponse(text: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: text } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function defaultStub() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    fetchCalls.push({ url, init: init ?? {}, body })
    if (url === OPENROUTER_URL) {
      return body.stream ? sseResponse('好的，已收到你的问题。') : jsonChatResponse('{"ok":true}')
    }
    return new Response('{"error":"unexpected host"}', { status: 418 })
  }))
}

let app: InstanceType<typeof Hono>
let dbHandle: InstanceType<typeof Database> | undefined

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  process.env.DATA_DIR = tmpDataDir
  process.env.AI_FREE_ONLY = 'true'
  process.env.OPENROUTER_API_KEY = FAKE_ENV_KEY
  delete process.env.MOONSHOT_API_KEY
  delete process.env.KIMI_API_KEY
  delete process.env.BUILTIN_EMBED_API_KEY
  delete process.env.DASHSCOPE_API_KEY
  vi.resetModules()
  defaultStub()

  const { aiRoutes } = await import('../routes/ai')
  const { memoryRoutes } = await import('../routes/memory')
  const { configRoutes } = await import('../routes/config')
  const { getDb } = await import('../db')
  const a = new Hono()
  a.use('/api/*', async (c, next) => { c.set('db' as never, getDb() as never); return next() })
  a.route('/api/ai', aiRoutes)
  a.route('/api/memory', memoryRoutes)
  a.route('/api/config', configRoutes)
  app = a

  dbHandle = getDb()
  const now = new Date().toISOString()
  const ins = dbHandle.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)')
  ins.run('apiKey', FAKE_STORED_KEY, now)
  ins.run('baseUrl', 'http://evil.example.com/v1', now)
  ins.run('model', 'gpt-4o-paid-model', now)
})

afterAll(() => {
  vi.unstubAllGlobals()
  try { dbHandle?.close() } catch { }
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function chatCalls() { return fetchCalls.filter(f => f.url.endsWith('/chat/completions')) }

const AUTHZ = (c: FetchCall) => (c.init.headers as Record<string, string>).Authorization ?? ''

describe('managed free mode — 路由集成', () => {
  it('POST /api/ai/stream: 钉死 OpenRouter + env key + free 模型 + 零价格体', async () => {
    fetchCalls.length = 0
    const res = await app.request('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '帮我分析一下这个架构设计的优缺点' }] })
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('data:')

    const calls = chatCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).toBe(OPENROUTER_URL)
      expect(AUTHZ(call)).toBe(`Bearer ${FAKE_ENV_KEY}`)
      expect(call.init.redirect).toBe('error')
      expect(String(call.body.model)).toMatch(/:free$/)
      const provider = call.body.provider as Record<string, unknown>
      expect(provider.allow_fallbacks).toBe(false)
      expect(provider.max_price).toEqual({ prompt: 0, completion: 0, request: 0, image: 0 })
    }
    for (const f of fetchCalls) {
      expect(f.url).not.toContain('moonshot')
      expect(f.url).not.toContain('dashscope')
      expect(f.url).not.toContain('evil.example.com')
      expect(AUTHZ(f)).not.toContain(FAKE_STORED_KEY)
    }
    const tools = calls[0].body.tools as Array<{ type?: string }> | undefined
    if (tools) {
      for (const t of tools) expect(t.type).toBe('function')
    }
    expect(calls[0].body.plugins).toBeUndefined()
  })

  it('POST /api/ai/summarize: 真实 schema 同样走托管通道', async () => {
    fetchCalls.length = 0
    const res = await app.request('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: '如何部署这个服务', assistantMessage: '可以使用 pm2 部署' })
    })
    expect(res.status).toBe(200)
    const calls = chatCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).toBe(OPENROUTER_URL)
      expect(AUTHZ(call)).toBe(`Bearer ${FAKE_ENV_KEY}`)
    }
  })

  it('/api/ai/stream 上游 500 回显密钥 → 通用 error 事件，无 done、无泄漏', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      fetchCalls.push({ url, init: init ?? {}, body })
      return new Response(`{"error":{"message":"leak attempt ${FAKE_ENV_KEY}"}}`, { status: 500 })
    }))
    fetchCalls.length = 0
    const res = await app.request('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好，测试上游失败' }] })
    })
    const text = await res.text()
    expect(text).toContain('"type":"error"')
    expect(text).not.toContain(FAKE_ENV_KEY)
    expect(text).not.toContain('leak attempt')
    expect(text).not.toContain('"type":"done"')
    defaultStub()
  })

  it('/api/ai/stream 上游 HTTP200 但 SSE 内嵌 error+密钥 → 通用 error，无 done、无泄漏', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      fetchCalls.push({ url, init: init ?? {}, body })
      return new Response(
        `data: {"error":{"message":"provider says ${FAKE_ENV_KEY} bad"}}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      )
    }))
    fetchCalls.length = 0
    const res = await app.request('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好，测试流内错误' }] })
    })
    const text = await res.text()
    expect(text).toContain('"type":"error"')
    expect(text).not.toContain(FAKE_ENV_KEY)
    expect(text).not.toContain('provider says')
    expect(text).not.toContain('"type":"done"')
    defaultStub()
  })

  it('后台任务 extractMentalModel 走同一托管 helper（env key + free 模型 + 零价）', async () => {
    const { extractMentalModel } = await import('../agentTasks')
    const db = dbHandle!
    const ins = db.prepare('INSERT OR REPLACE INTO memory_facts (id, fact, source_conv_id, created_at, invalid_at, type) VALUES (?, ?, ?, ?, NULL, ?)')
    const now = new Date().toISOString()
    ins.run('f1', '用户在做 AI 产品', 'c1', now, 'semantic')
    ins.run('f2', '用户偏好简洁界面', 'c1', now, 'semantic')
    ins.run('f3', '用户目标是做出 MVP', 'c1', now, 'semantic')

    fetchCalls.length = 0
    await extractMentalModel(db)
    const calls = chatCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).toBe(OPENROUTER_URL)
      expect(AUTHZ(call)).toBe(`Bearer ${FAKE_ENV_KEY}`)
      expect(String(call.body.model)).toMatch(/:free$/)
      const provider = call.body.provider as Record<string, unknown>
      expect(provider.max_price).toEqual({ prompt: 0, completion: 0, request: 0, image: 0 })
    }
  })

  it('POST /api/memory/extract: 记忆提取同样钉死托管通道', async () => {
    fetchCalls.length = 0
    const res = await app.request('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'test-conv-managed-1',
        userMessage: '我是做 AI 产品的独立开发者，目前在做画布笔记工具，处于早期探索阶段',
        assistantMessage: '好的'
      })
    })
    expect(res.status).toBe(200)
    const calls = chatCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.url).toBe(OPENROUTER_URL)
      expect(AUTHZ(call)).toBe(`Bearer ${FAKE_ENV_KEY}`)
      expect(String(call.body.model)).toMatch(/:free$/)
    }
  })

  it('GET /api/config/apikey 不含任何密钥', async () => {
    const res = await app.request('/api/config/apikey')
    expect(res.status).toBe(200)
    const data = await res.json() as { apiKey: string; hasKey: boolean; managed: boolean }
    expect(data.apiKey).toBe('')
    expect(data.managed).toBe(true)
    expect(data.hasKey).toBe(true)
    expect(JSON.stringify(data)).not.toContain(FAKE_ENV_KEY)
    expect(JSON.stringify(data)).not.toContain(FAKE_STORED_KEY)
  })

  it('PUT /api/config/settings 忽略托管模式下的覆盖尝试', async () => {
    const res = await app.request('/api/config/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: FAKE_STORED_KEY, baseUrl: 'http://attacker.example/v1', model: 'gpt-4o' })
    })
    expect(res.status).toBe(200)
    const getRes = await app.request('/api/config/settings')
    const settings = await getRes.json() as { managed: boolean; baseUrl: string; model: string }
    expect(settings.managed).toBe(true)
    expect(settings.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(String(settings.model)).toMatch(/:free$/)
    fetchCalls.length = 0
    await app.request('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'x', assistantMessage: 'y' })
    })
    for (const call of chatCalls()) {
      expect(call.url).toBe(OPENROUTER_URL)
      expect(AUTHZ(call)).toBe(`Bearer ${FAKE_ENV_KEY}`)
    }
  })
})
