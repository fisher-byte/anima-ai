import type Database from 'better-sqlite3'
import {
  allowedBaseUrl,
  freeChatBody,
  isManagedFreeMode,
  managedFreeModel,
  openRouterKey,
  OPENROUTER_BASE_URL,
  FREE_CHAT_MODELS,
  FREE_MAX_CONCURRENT,
  FREE_REQUEST_TIMEOUT_MS,
} from './aiPolicy'
import { reserveFreeRequest } from '../usageBudget'
import { AI_CONFIG } from '../../shared/constants'

const MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1'
const GEMMA_FREE_MODEL = FREE_CHAT_MODELS[1]

export interface ResolvedAIConfig {
  apiKey: string
  baseUrl: string
  model: string
  managedFree: boolean
  usingSharedKey: boolean
}

export class AIPolicyError extends Error {}

function configValue(db: InstanceType<typeof Database>, key: string): string {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    return (row?.value ?? '').trim()
  } catch {
    return ''
  }
}

const RETIRED_MOONSHOT_MODELS = new Set(['kimi-k2.5'])
function normalizeModel(model: string, baseUrl: string): string {
  const trimmed = model.trim()
  if (baseUrl.includes('moonshot')) {
    if (!trimmed.startsWith('kimi-') || RETIRED_MOONSHOT_MODELS.has(trimmed)) return 'kimi-k2.6'
    return trimmed
  }
  return trimmed || AI_CONFIG.MODEL
}

export function resolveAIConfig(db: InstanceType<typeof Database>): ResolvedAIConfig {
  if (isManagedFreeMode()) {
    const key = openRouterKey()
    if (!key) {
      return { apiKey: '', baseUrl: OPENROUTER_BASE_URL, model: FREE_CHAT_MODELS[0], managedFree: true, usingSharedKey: true }
    }
    return {
      apiKey: key,
      baseUrl: OPENROUTER_BASE_URL,
      model: managedFreeModel(),
      managedFree: true,
      usingSharedKey: true,
    }
  }

  const userKey = configValue(db, 'apiKey')
  const sharedKey = (process.env.SHARED_API_KEY ?? process.env.ONBOARDING_API_KEY ?? '').trim()
  const usingSharedKey = !userKey && !!sharedKey
  const apiKey = userKey || sharedKey

  let baseUrl: string
  try {
    const raw = usingSharedKey
      ? (process.env.SHARED_BASE_URL?.trim() || MOONSHOT_BASE_URL)
      : (configValue(db, 'baseUrl') || MOONSHOT_BASE_URL)
    baseUrl = allowedBaseUrl(raw)
  } catch {
    return { apiKey: '', baseUrl: '', model: '', managedFree: false, usingSharedKey: false }
  }

  return {
    apiKey,
    baseUrl,
    model: normalizeModel(configValue(db, 'model'), baseUrl),
    managedFree: false,
    usingSharedKey,
  }
}

export class QuotaExceededError extends Error {
  kind: 'minute' | 'concurrent' | 'unavailable'
  constructor(kind: 'minute' | 'concurrent' | 'unavailable', message: string) {
    super(message)
    this.kind = kind
  }
}

let activeUpstream = 0
export function acquireFreeSlot(): boolean {
  if (activeUpstream >= FREE_MAX_CONCURRENT) return false
  activeUpstream += 1
  return true
}
function releaseFreeSlot(): void {
  if (activeUpstream > 0) activeUpstream -= 1
}

export interface UpstreamHandle {
  res: Response
  release: () => void
}

async function fetchManaged(cfg: ResolvedAIConfig, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  return fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(freeChatBody(body)),
    signal,
    redirect: 'error',
  })
}

export async function upstreamChat(
  cfg: ResolvedAIConfig,
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<UpstreamHandle> {
  if (!cfg.managedFree) {
    const signals: AbortSignal[] = [AbortSignal.timeout(opts?.timeoutMs ?? FREE_REQUEST_TIMEOUT_MS)]
    if (opts?.signal) signals.push(opts.signal)
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
      redirect: 'error',
    })
    return { res, release: () => {} }
  }

  if (!acquireFreeSlot()) {
    throw new QuotaExceededError('concurrent', '当前请求过多，请稍后再试')
  }
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseFreeSlot()
  }
  try {
    const reservation = reserveFreeRequest()
    if (!reservation.ok) {
      throw new QuotaExceededError(
        reservation.reason ?? 'unavailable',
        reservation.reason === 'minute' ? '请求过于频繁，请稍后再试' : '用量保护服务暂时不可用，请稍后再试'
      )
    }
    const signals: AbortSignal[] = [AbortSignal.timeout(Math.min(opts?.timeoutMs ?? FREE_REQUEST_TIMEOUT_MS, FREE_REQUEST_TIMEOUT_MS))]
    if (opts?.signal) signals.push(opts.signal)
    const signal = AbortSignal.any(signals)

    let res = await fetchManaged(cfg, body, signal)

    if ((res.status === 429 || res.status === 503 || res.status === 403 || res.status === 404) && cfg.model !== GEMMA_FREE_MODEL) {
      const retryReservation = reserveFreeRequest()
      if (retryReservation.ok) {
        try { await res.body?.cancel() } catch { }
        res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(freeChatBody(body, GEMMA_FREE_MODEL)),
          signal,
          redirect: 'error',
        })
      }
    }

    return { res, release }
  } catch (e) {
    release()
    throw e
  }
}

export function sanitizedUpstreamError(status: number): string {
  if (status === 400) return '上游请求参数无效'
  if (status === 401 || status === 403) return '上游服务鉴权失败，请联系管理员'
  if (status === 404) return '上游服务路径不存在'
  if (status === 408 || status === 504) return '上游服务响应超时，请稍后再试'
  if (status === 429) return '上游服务请求过于频繁，请稍后再试'
  if (status >= 500) return '上游服务暂时不可用，请稍后再试'
  return `上游服务返回错误（${status}）`
}

export function sanitizedCaughtError(e: unknown): string {
  if (e instanceof QuotaExceededError) return e.message
  if (e instanceof Error && e.name === 'AbortError') return '请求已取消'
  return '网络请求失败，请稍后再试'
}
