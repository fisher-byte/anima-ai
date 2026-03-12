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

// GET /api/config/apikey
configRoutes.get('/apikey', (c) => {
  const db = userDb(c)
  return c.json({ apiKey: getConfig(db, 'apiKey') ?? '' })
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
  return c.json({
    model: getConfig(db, 'model') ?? '',
    baseUrl: getConfig(db, 'baseUrl') ?? ''
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
  const db = userDb(c)
  const userKey = getConfig(db, 'apiKey') ?? ''
  const sharedKey = process.env.SHARED_API_KEY ?? ''
  return c.json({ hasKey: !!(userKey || sharedKey) })
})

// POST /api/config/verify-key — lightweight upstream check (list models)
configRoutes.post('/verify-key', async (c) => {
  const { apiKey, baseUrl } = await c.req.json<{ apiKey: string; baseUrl?: string }>()
  const rawUrl = (baseUrl || 'https://api.moonshot.cn/v1').replace(/\/$/, '')
  // P1-5: 验证 baseUrl 格式，防止 SSRF 等攻击
  let url: string
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.json({ valid: false, reason: 'invalid_url' })
    }
    url = parsed.href.replace(/\/$/, '')
  } catch {
    return c.json({ valid: false, reason: 'invalid_url' })
  }
  try {
    const resp = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000)
    })
    return c.json({ valid: resp.ok })
  } catch {
    return c.json({ valid: false, reason: 'network' })
  }
})
