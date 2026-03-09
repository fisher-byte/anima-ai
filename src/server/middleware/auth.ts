/**
 * Auth middleware — multi-tenant token authentication
 *
 * Supports multiple ACCESS_TOKENS (comma-separated in env).
 * Each valid token maps to a unique userId (SHA-256 hash prefix) for data partitioning.
 *
 * Flow:
 *   1. AUTH_DISABLED=true → skip auth, use default db (local dev only)
 *   2. No ACCESS_TOKENS configured → local dev mode, skip auth
 *   3. Bearer token present → validate against allowed tokens, set userId
 *   4. No/invalid token → 401/403
 */

import type { MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'crypto'
import { tokenToUserId } from '../db'

/** Parse comma-separated ACCESS_TOKENS env into a Set */
function getAllowedTokens(): Set<string> {
  const raw = process.env.ACCESS_TOKENS || process.env.ACCESS_TOKEN || ''
  return new Set(
    raw.split(',').map(t => t.trim()).filter(Boolean)
  )
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Public endpoints (registered before auth middleware) are already handled
  // Fail-open for local dev
  const authDisabled = process.env.AUTH_DISABLED === 'true'
  if (authDisabled) {
    return next()
  }

  const allowedTokens = getAllowedTokens()
  if (allowedTokens.size === 0) {
    // No tokens configured → local dev mode
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const tokenRaw = authHeader.slice(7)
  const token = tokenRaw.trim()

  // Check against all allowed tokens using timing-safe comparison (compare trimmed values so env/paste whitespace does not cause 403)
  let matched = false
  const tokenBuf = Buffer.from(token)
  for (const allowed of allowedTokens) {
    const allowedBuf = Buffer.from(allowed)
    const sameLength = tokenBuf.length === allowedBuf.length
    if (sameLength && timingSafeEqual(tokenBuf, allowedBuf)) {
      matched = true
      break
    }
  }

  if (!matched) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Set userId for data partitioning (downstream routes use this)
  c.set('userId', tokenToUserId(token))
  return next()
}
