import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

let policy: typeof import('../lib/aiPolicy')
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = ['AI_FREE_ONLY', 'OPENROUTER_API_KEY', 'openrouter_apikey', 'OPENROUTER_MODEL']

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  process.env.AI_FREE_ONLY = 'true'
  process.env.OPENROUTER_API_KEY = 'sk-or-fake-policy-test'
  vi.resetModules()
  policy = await import('../lib/aiPolicy')
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('allowedBaseUrl 拒绝矩阵', () => {
  it.each([
    'http://openrouter.ai/api/v1',               // 非 HTTPS
    'https://localhost:8080/v1',                  // localhost
    'https://openrouter.ai.evil.com/v1',          // 相似域名
    'https://user:pass@openrouter.ai/api/v1',     // 带凭据
    'https://openrouter.ai:8443/api/v1',          // 非默认端口
    'https://openrouter.ai/api/v1?x=1',           // query
    'https://openrouter.ai/api/v1/extra',         // 额外 path
    'https://api.openai.com.evil.com/v1',
    'ftp://openrouter.ai/api/v1',
    'not-a-url',
  ])('拒绝 %s', (u) => {
    expect(() => policy.allowedBaseUrl(u)).toThrow()
  })

  it.each([
    'https://openrouter.ai/api/v1',
    'https://api.moonshot.cn/v1',
    'https://api.openai.com/v1',
    'https://openrouter.ai/api/v1/',              // 末尾斜杠归一化
  ])('放行 %s', (u) => {
    expect(policy.allowedBaseUrl(u)).toMatch(/^https:\/\//)
  })
})

describe('freeChatBody 钉扎', () => {
  const msgs = [{ role: 'user', content: 'hi' }]

  it('body.model / provider / plugins 覆盖一律失效', () => {
    const out = policy.freeChatBody({
      messages: msgs,
      model: 'openai/gpt-5-paid',
      provider: { allow_fallbacks: true, order: ['expensive'], max_price: { prompt: 9 } },
      plugins: [{ id: 'web' }],
      models: ['openai/gpt-5-paid'],
      max_tokens: 999999,
    })
    expect(out.model).toBe('dots-studio/dots-3-note-preview:free')
    const provider = out.provider as Record<string, unknown>
    expect(provider.allow_fallbacks).toBe(false)
    expect(provider.max_price).toEqual({ prompt: 0, completion: 0, request: 0, image: 0 })
    expect(provider.order).toBeUndefined()
    expect(out.plugins).toBeUndefined()
    expect(out.models).toBeUndefined()
    expect(out.max_tokens).toBe(4096)
  })

  it('显式 fallback 模型必须是白名单 free 模型', () => {
    const out = policy.freeChatBody({ messages: msgs }, 'google/gemma-4-26b-a4b-it:free')
    expect(out.model).toBe('google/gemma-4-26b-a4b-it:free')
    expect(() => policy.freeChatBody({ messages: msgs }, 'openai/gpt-5')).toThrow()
    expect(() => policy.freeChatBody({ messages: msgs }, 'dots-studio/dots-3-note-preview')).toThrow()
  })

  it('仅保留本地 function tools，剥离 builtin 工具', () => {
    const out = policy.freeChatBody({
      messages: msgs,
      tools: [
        { type: 'function', function: { name: 'search_memory', parameters: {} } },
        { type: 'builtin_function', function: { name: '$web_search' } }
      ]
    })
    const tools = out.tools as Array<{ type: string; function: { name: string } }>
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe('search_memory')
  })

  it('stream 时附 usage 统计要求', () => {
    const out = policy.freeChatBody({ messages: msgs, stream: true })
    expect(out.stream_options).toEqual({ include_usage: true })
    expect(policy.freeChatBody({ messages: msgs }).stream_options).toBeUndefined()
  })

  it('空消息 / 超限 max_tokens / 非法模型配置拒绝', () => {
    expect(() => policy.freeChatBody({ messages: [] })).toThrow()
    expect(() => policy.freeChatBody({ messages: msgs, max_tokens: 0 })).toThrow()
    expect(() => policy.freeChatBody({ messages: msgs, max_tokens: -5 })).toThrow()
  })
})

describe('managedFreeModel', () => {
  it('OPENROUTER_MODEL 非法值直接拒绝', () => {
    process.env.OPENROUTER_MODEL = 'openai/gpt-5'
    expect(() => policy.managedFreeModel()).toThrow()
    delete process.env.OPENROUTER_MODEL
    expect(policy.managedFreeModel()).toBe('dots-studio/dots-3-note-preview:free')
  })
})
