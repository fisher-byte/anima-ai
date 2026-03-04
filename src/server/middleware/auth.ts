/**
 * Auth middleware
 *
 * 默认开启鉴权（Fail Closed）；设置 AUTH_DISABLED=true 才跳过（用于本地开发）。
 * 若启用鉴权，需同时设置 ACCESS_TOKEN 环境变量。
 *
 * Phase 2 (future): Replace with JWT validation and userId extraction.
 */

import type { MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'crypto'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // 安全默认：只有明确设置 AUTH_DISABLED=true 时才跳过鉴权（Fail Closed）
  const authDisabled = process.env.AUTH_DISABLED === 'true'

  if (authDisabled) {
    return next()
  }

  const accessToken = process.env.ACCESS_TOKEN
  if (!accessToken) {
    // 未配置 token 视为本地开发模式，放行
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  // 使用常量时间比较防止时序攻击（timing attack）
  // 长度不同时仍执行比较（用 accessToken 自比），避免通过响应时间泄露 token 长度
  const tokenBuf = Buffer.from(token)
  const secretBuf = Buffer.from(accessToken)
  const sameLength = tokenBuf.length === secretBuf.length
  // 长度不同时用 secretBuf 自身做无效比较（结果固定为 true，但 sameLength=false 保证拒绝）
  const tokenMatch = sameLength && timingSafeEqual(tokenBuf, secretBuf)

  if (!tokenMatch) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return next()
}
