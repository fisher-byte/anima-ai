/**
 * Feedback routes
 *
 * GET  /api/feedback  — list all feedback reports (admin use, ordered by created_at DESC)
 * POST /api/feedback  — submit a feedback report
 */

import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'

export const feedbackRoutes = new Hono()

// P1-4: 反馈文字上限 5000 字符，图片上限 5 MB（base64 字符数 × 0.75 ≈ 字节数）
const MAX_MESSAGE_LENGTH = 5000
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(5 * 1024 * 1024 * (4 / 3)) // ~6.9M chars

function userDb(c: { get: (key: string) => unknown }): InstanceType<typeof Database> {
  return c.get('db') as InstanceType<typeof Database>
}

// GET /api/feedback
feedbackRoutes.get('/', (c) => {
  const db = userDb(c)
  const rows = db.prepare(
    `SELECT id, type, message, context, image_mime, created_at
     FROM feedback_reports
     ORDER BY created_at DESC`
  ).all()
  return c.json({ reports: rows })
})

// POST /api/feedback
feedbackRoutes.post('/', async (c) => {
  const db = userDb(c)
  const body = await c.req.json<{
    type?: string
    message?: string
    context?: Record<string, unknown>
    imageData?: string
    imageMime?: string
  }>()

  const message = body.message ?? ''
  if (!message.trim()) {
    return c.json({ error: 'message is required' }, 400)
  }
  // P1-4: 消息长度限制
  if (message.length > MAX_MESSAGE_LENGTH) {
    return c.json({ error: `message 过长，最大 ${MAX_MESSAGE_LENGTH} 字符` }, 400)
  }

  // P1-4: 图片大小限制（5 MB）
  if (body.imageData && body.imageData.length > MAX_IMAGE_BASE64_LENGTH) {
    return c.json({ error: '图片过大，最大支持 5MB' }, 413)
  }

  const id = randomUUID()
  const type = body.type ?? 'feedback'
  const context = JSON.stringify(body.context ?? {})
  const imageData = body.imageData ? Buffer.from(body.imageData, 'base64') : null
  const imageMime = body.imageMime ?? null
  const createdAt = new Date().toISOString()

  db.prepare(
    `INSERT INTO feedback_reports (id, type, message, context, image_data, image_mime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, message, context, imageData, imageMime, createdAt)

  return c.json({ ok: true, id }, 201)
})
