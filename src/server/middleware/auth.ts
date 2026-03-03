/**
 * Auth middleware
 *
 * Phase 1: Static Bearer token from environment variable.
 * AUTH_ENABLED=false  → skip (local dev)
 * AUTH_ENABLED=true   → validate Authorization: Bearer <ACCESS_TOKEN>
 *
 * Phase 2 (future): Replace with JWT validation and userId extraction.
 */

import type { MiddlewareHandler } from 'hono'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authEnabled = process.env.AUTH_ENABLED === 'true'

  if (!authEnabled) {
    return next()
  }

  const accessToken = process.env.ACCESS_TOKEN
  if (!accessToken) {
    console.warn('AUTH_ENABLED=true but ACCESS_TOKEN is not set')
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  if (token !== accessToken) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return next()
}
