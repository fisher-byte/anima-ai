/**
 * Auth middleware — per Bearer token → isolated SQLite (userId = SHA-256 前 12 hex)
 *
 * 与 `/api/auth/status` 一致：当配置了 ACCESS_TOKEN / ACCESS_TOKENS 且未禁用鉴权时，
 * **必须**携带非空 Bearer，否则返回 401，禁止落入共享的 `_default` 库。
 *
 * 开发环境（AUTH_DISABLED=true 或未配置任何 token）：允许无 token，仍走 `_default`（本地单机）。
 */

import type { MiddlewareHandler } from 'hono'
import { tokenToUserId } from '../db'

/** 与 `GET /api/auth/status` 中 `authRequired` 判定保持一致 */
export function isAuthRequired(): boolean {
  const authDisabled = process.env.AUTH_DISABLED === 'true'
  const hasTokens = !!(process.env.ACCESS_TOKENS || process.env.ACCESS_TOKEN)
  return !authDisabled && hasTokens
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // CORS 预检不带 Authorization，必须放行
  if (c.req.method === 'OPTIONS') {
    return next()
  }

  const authHeader = c.req.header('Authorization')

  if (!isAuthRequired()) {
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      if (token) {
        c.set('userId', tokenToUserId(token))
      }
    }
    return next()
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: '缺少 Authorization: Bearer <身份码>，无法隔离用户数据' },
      401
    )
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Bearer token 不能为空' }, 401)
  }

  c.set('userId', tokenToUserId(token))
  return next()
}
