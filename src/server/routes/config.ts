/**
 * Config routes
 *
 * GET /api/config/apikey        → retrieve stored API key
 * PUT /api/config/apikey        → store API key (JSON body: { apiKey: string })
 * GET /api/config/settings      → retrieve model + baseUrl settings
 * PUT /api/config/settings      → store model + baseUrl (JSON body: { model?, baseUrl? })
 */

import { Hono } from 'hono'
import type Database from 'better-sqlite3'
import { allowedBaseUrl, isManagedFreeMode, managedFreeModel, openRouterKey, OPENROUTER_BASE_URL, FREE_CHAT_MODELS } from '../lib/aiPolicy'

export const configRoutes = new Hono()

/** Get the per-user database from request context */
function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

const upsertConfig = (db: InstanceType<typeof Database>, key: string, value: string) => {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

const getConfig = (db: InstanceType<typeof Database>, key: string): string | null => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

configRoutes.get('/apikey', (c) => {
  const db = userDb(c)
  const stored = getConfig(db, 'apiKey')
  const managed = isManagedFreeMode()
  return c.json({ apiKey: '', hasKey: managed ? !!openRouterKey() : !!stored, managed })
})

// PUT /api/config/apikey
configRoutes.put('/apikey', async (c) => {
  const db = userDb(c)
  const body = await c.req.json<{ apiKey: string }>()
  const { apiKey } = body

  if (typeof apiKey !== 'string') {
    return c.json({ error: 'apiKey must be a string' }, 400)
  }

  // 空字符串不覆盖已有 key，防止用户误操作清空
  if (apiKey.trim() === '') {
    return c.json({ ok: true, skipped: true })
  }

  upsertConfig(db, 'apiKey', apiKey)
  return c.json({ ok: true })
})

// GET /api/config/settings
configRoutes.get('/settings', (c) => {
  const db = userDb(c)
  const managed = isManagedFreeMode()
  let managedModel = FREE_CHAT_MODELS[0] as string
  try { managedModel = managedFreeModel() } catch { }
  return c.json({
    model: managed ? managedModel : (getConfig(db, 'model') ?? ''),
    baseUrl: managed ? OPENROUTER_BASE_URL : (getConfig(db, 'baseUrl') ?? ''),
    managed
  })
})

// PUT /api/config/settings
configRoutes.put('/settings', async (c) => {
  const db = userDb(c)
  const body = await c.req.json<{ model?: string; baseUrl?: string }>()

  // P1-5: baseUrl 格式验证 — 必须是合法的 http/https URL
  if (body.baseUrl !== undefined) {
    if (body.baseUrl !== '') {
      let parsedUrl: URL
      try {
        parsedUrl = new URL(body.baseUrl)
      } catch {
        return c.json({ error: 'baseUrl 格式无效，请输入合法的 URL（以 http:// 或 https:// 开头）' }, 400)
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return c.json({ error: 'baseUrl 必须以 http:// 或 https:// 开头' }, 400)
      }
    }
    upsertConfig(db, 'baseUrl', body.baseUrl)
  }

  if (body.model !== undefined) upsertConfig(db, 'model', body.model)

  return c.json({ ok: true })
})

// GET /api/config/has-usable-key — 前端用：判断当前用户是否可用 key（用户自有 key 或后端共享 key 任一即可）
configRoutes.get('/has-usable-key', (c) => {
  if (isManagedFreeMode()) {
    return c.json({ hasKey: !!openRouterKey() })
  }
  const db = userDb(c)
  const userKey = getConfig(db, 'apiKey') ?? ''
  const sharedKey = process.env.SHARED_API_KEY ?? ''
  return c.json({ hasKey: !!(userKey || sharedKey) })
})

// POST /api/config/verify-key — lightweight upstream check (list models)
// 调用方提供自己的 key（用户付费），但仍加每用户滑动窗口限流防刷：10 次/分钟
const verifyAttempts = new Map<string, number[]>()
const VERIFY_WINDOW_MS = 60_000
const VERIFY_MAX_PER_WINDOW = 10

/** Get userId set by auth middleware (loose typing, same pattern as userDb) */
function userIdOf(c: { get: (key: string) => unknown }): string {
  return (c.get('userId') as string | undefined) ?? '_default'
}

configRoutes.post('/verify-key', async (c) => {
  const userId = userIdOf(c)
  const now = Date.now()
  const recent = (verifyAttempts.get(userId) ?? []).filter(t => now - t < VERIFY_WINDOW_MS)
  if (recent.length >= VERIFY_MAX_PER_WINDOW) {
    verifyAttempts.set(userId, recent)
    return c.json({ valid: false, reason: 'rate_limited' }, 429)
  }
  recent.push(now)
  verifyAttempts.set(userId, recent)

  const { apiKey, baseUrl } = await c.req.json<{ apiKey: string; baseUrl?: string }>()
  let url: string
  try {
    url = allowedBaseUrl(baseUrl || 'https://api.moonshot.cn/v1')
  } catch {
    return c.json({ valid: false, reason: 'invalid_url' })
  }
  try {
    const resp = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
      redirect: 'error'
    })
    return c.json({ valid: resp.ok })
  } catch {
    return c.json({ valid: false, reason: 'network' })
  }
})
