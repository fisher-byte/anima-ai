/**
 * Anima Hono Server
 *
 * Serves:
 * - /api/*          → REST API routes (storage, config, AI proxy)
 * - /*              → Static frontend (dist/)
 *
 * Multi-tenant: each ACCESS_TOKEN gets an isolated SQLite database.
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type Database from 'better-sqlite3'
import { authMiddleware } from './middleware/auth'
import { getDb } from './db'
import { storageRoutes } from './routes/storage'
import { configRoutes } from './routes/config'
import { aiRoutes } from './routes/ai'
import { memoryRoutes, initCategoryPrototypes } from './routes/memory'
import { startAgentWorker, bootstrapAllEmbeddings } from './agentWorker'

type AppEnv = {
  Variables: {
    userId: string | undefined
    db: InstanceType<typeof Database>
  }
}

const app = new Hono<AppEnv>()

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('*', logger())
app.use(
  '/api/*',
  cors({
    // 生产环境默认不开放跨域；开发环境允许任意来源（本地 Vite / Electron 调试）
    origin: () => (process.env.NODE_ENV === 'production' ? null : '*'),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })
)

// ── Health check (public, before auth) ───────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ── Auth status (public, before auth) — frontend uses this to detect login requirement
app.get('/api/auth/status', (c) => {
  const authDisabled = process.env.AUTH_DISABLED === 'true'
  const hasTokens = !!(process.env.ACCESS_TOKENS || process.env.ACCESS_TOKEN)
  const authRequired = !authDisabled && hasTokens
  return c.json({ authRequired })
})

// ── Auth (all /api/* routes) ──────────────────────────────────────────────────
app.use('/api/*', authMiddleware)

// ── Per-user DB middleware (runs after auth, sets c.var.db) ───────────────────
app.use('/api/*', async (c, next) => {
  const userId = c.get('userId') as string | undefined
  c.set('db', getDb(userId))
  return next()
})

// ── API Routes ────────────────────────────────────────────────────────────────
app.route('/api/storage', storageRoutes)
app.route('/api/config', configRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/memory', memoryRoutes)

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
  console.log(`Anima server running at http://localhost:${PORT}`)
  // 启动后台 Agent Worker（画像提取、记忆索引等）
  startAgentWorker()
  // 启动时预跑历史 embedding（仅补充缺失的，不重复计算）
  bootstrapAllEmbeddings().catch(e => console.warn('[bootstrap] failed:', e))
  // 启动时初始化分类原型向量（内置 key，六类）
  initCategoryPrototypes().catch(e => console.warn('[classify] prototype init failed:', e))
})
