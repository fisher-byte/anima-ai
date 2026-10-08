/**
 * usageBudget.ts — 全局日用量账本单元测试
 *
 * 每个用例使用独立临时 DATA_DIR 并通过 vi.resetModules + 动态 import
 * 获得全新的账本实例（模块内缓存了自己的 DB 句柄）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'

type BudgetModule = typeof import('../usageBudget')

let tmpDir: string

async function loadBudget(): Promise<BudgetModule> {
  vi.resetModules()
  return await import('../usageBudget')
}

/** 直接打开账本文件读取当日 tokens（不经过被测模块）；账本尚未创建视为 0 */
function rawTodayTokens(day?: string): number {
  const dbPath = path.join(tmpDir, 'usage-ledger.db')
  if (!fs.existsSync(dbPath)) return 0
  const db = new Database(dbPath, { readonly: true })
  try {
    const d = day ?? new Date().toISOString().slice(0, 10)
    const row = db.prepare('SELECT tokens FROM daily_usage WHERE day = ?').get(d) as { tokens: number } | undefined
    return row?.tokens ?? 0
  } finally {
    db.close()
  }
}

function allDays(): { day: string; tokens: number }[] {
  const dbPath = path.join(tmpDir, 'usage-ledger.db')
  if (!fs.existsSync(dbPath)) return []
  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare('SELECT day, tokens FROM daily_usage ORDER BY day').all() as { day: string; tokens: number }[]
  } finally {
    db.close()
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-budget-'))
  process.env.DATA_DIR = tmpDir
  delete process.env.DAILY_LIMIT_YUAN
  delete process.env.AI_PRICE_PER_1K_TOKENS
})

afterEach(() => {
  delete process.env.DATA_DIR
  delete process.env.DAILY_LIMIT_YUAN
  delete process.env.AI_PRICE_PER_1K_TOKENS
  vi.useRealTimers()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('reserveTokens', () => {
  it('在限额内预留成功并记账', async () => {
    const b = await loadBudget()
    const r = b.reserveTokens(1000)
    expect(r.ok).toBe(true)
    expect(r.limitYuan).toBe(5) // 默认 ¥5
    expect(rawTodayTokens()).toBe(1000)
  })

  it('累计预留超过日限额时被拒绝', async () => {
    const b = await loadBudget()
    // 默认限额 ¥5 / ¥0.05每千 → 100k tokens
    expect(b.reserveTokens(60_000).ok).toBe(true)
    expect(b.reserveTokens(40_000).ok).toBe(true)  // 累计恰好 100k，边界允许
    const denied = b.reserveTokens(1)
    expect(denied.ok).toBe(false)
    expect(denied.usedYuan).toBeCloseTo(5, 1)
    expect(rawTodayTokens()).toBe(100_000)
  })

  it('单次预留超过限额时直接拒绝（首日也不例外）', async () => {
    const b = await loadBudget()
    const r = b.reserveTokens(200_000)
    expect(r.ok).toBe(false)
    expect(rawTodayTokens()).toBe(0)
  })

  it('DAILY_LIMIT_YUAN / AI_PRICE_PER_1K_TOKENS 可覆盖默认值', async () => {
    process.env.DAILY_LIMIT_YUAN = '0.001'    // → 20 tokens
    const b = await loadBudget()
    expect(b.reserveTokens(10).ok).toBe(true)
    expect(b.reserveTokens(11).ok).toBe(false)
  })
})

describe('settleTokens', () => {
  it('实际用量低于预留时回落', async () => {
    const b = await loadBudget()
    b.reserveTokens(1000)
    b.settleTokens(1000, 400)
    expect(rawTodayTokens()).toBe(400)
  })

  it('实际用量高于预留时补足', async () => {
    const b = await loadBudget()
    b.reserveTokens(1000)
    b.settleTokens(1000, 1600)
    expect(rawTodayTokens()).toBe(1600)
  })

  it('上游未返回 usage 时保留预留（actual === reserved）', async () => {
    const b = await loadBudget()
    b.reserveTokens(800)
    b.settleTokens(800, 800)
    expect(rawTodayTokens()).toBe(800)
  })

  it('失败调用 settle(0) 全额退还预留', async () => {
    const b = await loadBudget()
    b.reserveTokens(2000)
    b.settleTokens(2000, 0)
    expect(rawTodayTokens()).toBe(0)
  })

  it('结算后 tokens 不会低于 0', async () => {
    const b = await loadBudget()
    b.reserveTokens(500)
    b.settleTokens(2000, 0) // 异常调用：退还的预留大于账面
    expect(rawTodayTokens()).toBe(0)
  })
})

describe('recordSearchCalls', () => {
  it('按 ¥0.03/次折算 token 记账（默认价 → 600 tokens/次）', async () => {
    const b = await loadBudget()
    b.recordSearchCalls(1)
    expect(rawTodayTokens()).toBe(600)
    b.recordSearchCalls(2)
    expect(rawTodayTokens()).toBe(1800)
  })

  it('n <= 0 时不动账本', async () => {
    const b = await loadBudget()
    b.recordSearchCalls(0)
    b.recordSearchCalls(-3)
    expect(rawTodayTokens()).toBe(0)
  })
})

describe('日切换', () => {
  it('UTC 跨天后使用新行并恢复额度', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T10:00:00Z'))
    const b = await loadBudget()
    expect(b.reserveTokens(90_000).ok).toBe(true)
    expect(b.reserveTokens(20_000).ok).toBe(false) // 当日已满

    vi.setSystemTime(new Date('2026-02-02T00:00:01Z'))
    expect(b.reserveTokens(90_000).ok).toBe(true)  // 新的一天恢复

    const days = allDays()
    expect(days).toEqual([
      { day: '2026-02-01', tokens: 90_000 },
      { day: '2026-02-02', tokens: 90_000 }
    ])
  })
})

describe('fail-closed', () => {
  it('账本 DB 无法打开时 reserve 拒绝且不抛异常', async () => {
    // DATA_DIR 指向一个已存在的文件 → mkdir/open 必失败
    const filePath = path.join(tmpDir, 'not-a-dir')
    fs.writeFileSync(filePath, 'x')
    process.env.DATA_DIR = path.join(filePath, 'sub')

    const b = await loadBudget()
    const r = b.reserveTokens(100)
    expect(r.ok).toBe(false)
    // budgetStatus 仍返回合法形状，不抛
    const s = b.budgetStatus()
    expect(s.limitYuan).toBe(5)
  })
})

describe('budgetStatus', () => {
  it('返回已用/限额快照', async () => {
    const b = await loadBudget()
    b.reserveTokens(2500)
    const s = b.budgetStatus()
    expect(s.usedTokens).toBe(2500)
    expect(s.limitTokens).toBe(100_000)
    expect(s.usedYuan).toBeCloseTo(0.125, 3)
    expect(s.limitYuan).toBe(5)
  })
})
