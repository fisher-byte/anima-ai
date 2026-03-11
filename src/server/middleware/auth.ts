/**
 * Auth middleware — open access with per-user UUID isolation
 *
 * New model (open product):
 *   - Any request with a Bearer token is accepted; the token becomes the userId key
 *   - No whitelist check — the token IS the user identity (client-generated UUID)
 *   - No token → use '_default' bucket (local dev only)
 *
 * Legacy env vars (ACCESS_TOKEN / ACCESS_TOKENS) are no longer used for
 * authentication, but are kept for backward-compatibility during migration.
 */

import type { MiddlewareHandler } from 'hono'
import { tokenToUserId } from '../db'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) {
      c.set('userId', tokenToUserId(token))
    }
  }
  // No token → userId stays undefined → falls back to '_default' db in getDb()
  return next()
}
