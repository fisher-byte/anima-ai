/**
 * Global usage ledger — server-cost guard for env-owned credentials
 *
 * Single better-sqlite3 DB shared across ALL users (unlike the old per-user
 * config-table counter, which was trivially bypassable by minting a new token).
 * Tracks the server's daily upstream spend in "token-equivalents":
 *   - chat completions: actual usage.total_tokens
 *   - builtin embeddings: usage.total_tokens when present, else a fixed estimate
 *   - Kimi $web_search builtin calls: ¥0.03/call converted to token-equivalents
 *
 * Day boundary = UTC (new Date().toISOString().slice(0,10)).
 * reserveTokens() is atomic and FAILS CLOSED on any error.
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { FREE_DAILY_REQUEST_LIMIT, FREE_REQUESTS_PER_MINUTE } from './lib/aiPolicy'

/**
 * 保守混合估价：¥50 / 1M tokens ≈ ¥0.05 / 1K。
 * 近似值（thinking 输出、搜索溢价、embeddings 混合），可用 AI_PRICE_PER_1K_TOKENS 覆盖。
 */
const DEFAULT_PRICE_PER_1K_TOKENS = 0.05
const DEFAULT_DAILY_LIMIT_YUAN = 5
/** Kimi 内置 $web_search：每次触发（finish_reason=tool_calls 的一轮）¥0.03 */
const SEARCH_CALL_FEE_YUAN = 0.03

let db: InstanceType<typeof Database> | null = null
let disabled = false

/** Lazy-open the ledger DB. Returns null when unavailable (callers fail closed). */
function ledger(): InstanceType<typeof Database> | null {
  if (db || disabled) return db
  try {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    const d = new Database(path.join(dir, 'usage-ledger.db'))
    d.pragma('journal_mode = WAL')
    d.exec(`
      CREATE TABLE IF NOT EXISTS daily_usage (
        day        TEXT PRIMARY KEY,
        tokens     INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `)
    d.exec(`
      CREATE TABLE IF NOT EXISTS free_ai_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, started_at INTEGER NOT NULL)
    `)
    d.exec(`
      CREATE INDEX IF NOT EXISTS free_ai_requests_day ON free_ai_requests(day)
    `)
    db = d
  } catch (e) {
    disabled = true
    console.warn('[budget] usage-ledger unavailable, budget enforced as exhausted:', e instanceof Error ? e.message : e)
  }
  return db
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ¥ per 1K tokens (env-overridable approximation) */
export function pricePer1K(): number {
  const v = parseFloat(process.env.AI_PRICE_PER_1K_TOKENS ?? '')
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_PRICE_PER_1K_TOKENS
}

/** Daily spend cap in ¥ */
export function dailyLimitYuan(): number {
  const v = parseFloat(process.env.DAILY_LIMIT_YUAN ?? '')
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_LIMIT_YUAN
}

function dailyLimitTokens(): number {
  return Math.round((dailyLimitYuan() / pricePer1K()) * 1000)
}

function tokensToYuan(tokens: number): number {
  return (tokens / 1000) * pricePer1K()
}

export interface ReserveResult {
  ok: boolean
  usedYuan: number
  limitYuan: number
}

/**
 * Atomically reserve `estimated` token-equivalents against today's budget.
 * Returns ok:false when the reservation would exceed the daily limit, or on
 * ANY error (fail closed — a broken ledger must not open the spend tap).
 */
export function reserveTokens(estimated: number): ReserveResult {
  const limitYuan = dailyLimitYuan()
  try {
    const d = ledger()
    if (!d) return { ok: false, usedYuan: 0, limitYuan }

    const est = Math.max(0, Math.ceil(estimated))
    const limit = dailyLimitTokens()
    if (est > limit) {
      const row = d.prepare('SELECT tokens FROM daily_usage WHERE day = ?').get(today()) as { tokens: number } | undefined
      return { ok: false, usedYuan: tokensToYuan(row?.tokens ?? 0), limitYuan }
    }

    const now = new Date().toISOString()
    const res = d.prepare(`
      INSERT INTO daily_usage (day, tokens, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET
        tokens     = daily_usage.tokens + excluded.tokens,
        updated_at = excluded.updated_at
      WHERE daily_usage.tokens + excluded.tokens <= ?
    `).run(today(), est, now, limit)

    const row = d.prepare('SELECT tokens FROM daily_usage WHERE day = ?').get(today()) as { tokens: number } | undefined
    return { ok: res.changes === 1, usedYuan: tokensToYuan(row?.tokens ?? 0), limitYuan }
  } catch {
    return { ok: false, usedYuan: 0, limitYuan }
  }
}

/**
 * Reconcile a reservation with the actual usage after the call completes.
 * Adjusts today's row by (actual - reserved), floored at 0.
 * Caller passes `actual === reserved` when upstream reports no usage
 * (conservative: keep the reservation).
 */
export function settleTokens(reserved: number, actual: number): void {
  try {
    const d = ledger()
    if (!d) return
    const delta = Math.ceil(actual) - Math.ceil(reserved)
    if (delta === 0) return
    d.prepare('UPDATE daily_usage SET tokens = MAX(0, tokens + ?), updated_at = ? WHERE day = ?')
      .run(delta, new Date().toISOString(), today())
  } catch { /* best-effort accounting — never crash the request path */ }
}

/** Record `n` triggered $web_search builtin calls (¥0.03 each, token-equivalent). */
export function recordSearchCalls(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return
  try {
    const d = ledger()
    if (!d) return
    const tokens = Math.round(n * (SEARCH_CALL_FEE_YUAN / pricePer1K()) * 1000)
    const now = new Date().toISOString()
    // Actual spend already incurred — unconditional add (may exceed the cap slightly)
    d.prepare(`
      INSERT INTO daily_usage (day, tokens, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET
        tokens     = daily_usage.tokens + excluded.tokens,
        updated_at = excluded.updated_at
    `).run(today(), tokens, now)
  } catch { /* best-effort */ }
}

/** Snapshot of today's usage for user-facing messages / smoke checks. */
export function budgetStatus(): { usedTokens: number; limitTokens: number; usedYuan: number; limitYuan: number } {
  const limitTokens = dailyLimitTokens()
  const limitYuan = dailyLimitYuan()
  try {
    const d = ledger()
    if (!d) return { usedTokens: 0, limitTokens, usedYuan: 0, limitYuan }
    const row = d.prepare('SELECT tokens FROM daily_usage WHERE day = ?').get(today()) as { tokens: number } | undefined
    const usedTokens = row?.tokens ?? 0
    return { usedTokens, limitTokens, usedYuan: tokensToYuan(usedTokens), limitYuan }
  } catch {
    return { usedTokens: 0, limitTokens, usedYuan: 0, limitYuan }
  }
}

export function reserveFreeRequest(): { ok: boolean; reason?: 'daily' | 'minute' } {
  try {
    const d = ledger()
    if (!d) return { ok: false }
    const day = today()
    const now = Date.now()
    const minuteAgo = now - 60_000
    return d.transaction(() => {
      const dayRow = d.prepare('SELECT COUNT(*) AS n FROM free_ai_requests WHERE day = ?').get(day) as { n: number }
      if (dayRow.n >= FREE_DAILY_REQUEST_LIMIT) return { ok: false as const, reason: 'daily' as const }
      const minRow = d.prepare('SELECT COUNT(*) AS n FROM free_ai_requests WHERE started_at > ?').get(minuteAgo) as { n: number }
      if (minRow.n >= FREE_REQUESTS_PER_MINUTE) return { ok: false as const, reason: 'minute' as const }
      d.prepare('INSERT INTO free_ai_requests (day, started_at) VALUES (?, ?)').run(day, now)
      return { ok: true as const }
    }).immediate()
  } catch {
    return { ok: false }
  }
}

/** Test/maintenance hook: close the ledger handle so a fresh import reopens it. */
export function closeLedger(): void {
  try { db?.close() } catch { /* ignore */ }
  db = null
  disabled = false
}
