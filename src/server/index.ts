/**
 * EvoCanvas Hono Server
 *
 * Serves:
 * - /api/*          → REST API routes (storage, config, AI proxy)
 * - /*              → Static frontend (dist/)
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth'
import { storageRoutes } from './routes/storage'
import { configRoutes } from './routes/config'
import { aiRoutes } from './routes/ai'
import { memoryRoutes } from './routes/memory'
import { startAgentWorker } from './agentWorker'

const app = new Hono()

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })
)

// ── Auth (all /api/* routes) ──────────────────────────────────────────────────
app.use('/api/*', authMiddleware)

// ── API Routes ────────────────────────────────────────────────────────────────
app.route('/api/storage', storageRoutes)
app.route('/api/config', configRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/memory', memoryRoutes)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ── Static Frontend (production) ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(
    '/*',
    serveStatic({
      root: './dist',
      rewriteRequestPath: (path) => path
    })
  )
  // SPA fallback
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`EvoCanvas server running at http://localhost:${PORT}`)
  // 启动后台 Agent Worker（画像提取、记忆索引等）
  startAgentWorker()
})
