export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const FREE_CHAT_MODELS = [
  'dots-studio/dots-3-note-preview:free',
  'google/gemma-4-26b-a4b-it:free'
] as const
export const FREE_REQUESTS_PER_MINUTE = 10
export const FREE_MAX_CONCURRENT = 2
export const FREE_MAX_OUTPUT_TOKENS = 4096
export const FREE_MAX_BODY_BYTES = 20 * 1024 * 1024
export const FREE_REQUEST_TIMEOUT_MS = 120_000

export function openRouterKey(): string {
  return (process.env.OPENROUTER_API_KEY || process.env.openrouter_apikey || '').trim()
}

export function isManagedFreeMode(): boolean {
  return process.env.AI_FREE_ONLY === 'true' || !!openRouterKey()
}

export function managedFreeModel(): string {
  const model = process.env.OPENROUTER_MODEL?.trim() || FREE_CHAT_MODELS[0]
  if (!(FREE_CHAT_MODELS as readonly string[]).includes(model)) {
    throw new Error('服务端免费模型配置无效，已阻止请求')
  }
  return model
}

export function allowedBaseUrl(value: string): string {
  const url = new URL(value)
  const normalized = url.href.replace(/\/$/, '')
  if (![
    OPENROUTER_BASE_URL,
    'https://api.moonshot.cn/v1',
    'https://api.openai.com/v1'
  ].includes(normalized)) {
    throw new Error('仅允许官方 HTTPS API 地址')
  }
  return normalized
}

export function freeChatBody(body: Record<string, unknown>, model = managedFreeModel()): Record<string, unknown> {
  if (!(FREE_CHAT_MODELS as readonly string[]).includes(model)) {
    throw new Error('禁止调用非白名单免费模型')
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error('对话消息不能为空')
  }
  const raw = JSON.stringify(body.messages)
  if (Buffer.byteLength(raw, 'utf8') > FREE_MAX_BODY_BYTES) {
    throw new Error('请求内容超过安全上限')
  }
  const requested = Number(body.max_tokens ?? FREE_MAX_OUTPUT_TOKENS)
  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error('输出长度配置无效')
  }
  const result: Record<string, unknown> = {
    model,
    messages: body.messages,
    stream: body.stream === true,
    max_tokens: Math.min(FREE_MAX_OUTPUT_TOKENS, Math.floor(requested)),
    reasoning: { enabled: false },
    provider: {
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0, request: 0, image: 0 }
    }
  }
  for (const key of ['temperature', 'top_p', 'stop', 'response_format', 'seed']) {
    if (body[key] !== undefined) result[key] = body[key]
  }
  if (Array.isArray(body.tools)) {
    const tools = body.tools.filter((tool: unknown) =>
      typeof tool === 'object' && tool !== null && (tool as { type?: string }).type === 'function'
    )
    if (tools.length > 0) {
      result.tools = tools
      if (body.tool_choice !== undefined) result.tool_choice = body.tool_choice
    }
  }
  if (result.stream) result.stream_options = { include_usage: true }
  return result
}
