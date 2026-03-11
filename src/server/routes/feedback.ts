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
