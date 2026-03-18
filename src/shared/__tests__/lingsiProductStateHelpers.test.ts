import { describe, expect, it } from 'vitest'
import {
  buildPersonaEvalSummary,
  buildProductStateSummary,
  countEvalWinners,
  extractLatestReleaseSnapshot,
} from '../lingsiProductState'

describe('lingsiProductState helpers', () => {
  it('parses the latest changelog release snapshot', () => {
    const snapshot = extractLatestReleaseSnapshot(`## [0.5.21] - 2026-03-18

### feat: demo release

**新增与修复：**
- 第一项
- 第二项

**测试与验证：**
- npm test
`)

    expect(snapshot.version).toBe('0.5.21')
    expect(snapshot.date).toBe('2026-03-18')
    expect(snapshot.title).toBe('feat: demo release')
    expect(snapshot.changes).toEqual(['第一项', '第二项'])
  })

  it('summarizes eval winners deterministically', () => {
    const counts = countEvalWinners([
      { judge: { winner: 'decision' } },
      { judge: { winner: 'normal' } },
      { judge: { winner: 'decision' } },
      { judge: { winner: 'tie' } },
      {},
    ])

    expect(counts).toEqual({ decision: 2, normal: 1, tie: 2 })
    expect(buildPersonaEvalSummary('Lenny', [
      { judge: { winner: 'decision' } },
      { judge: { winner: 'decision' } },
      { judge: { winner: 'tie' } },
    ])).toBe('Lenny 基线评测当前为 decision 2 / normal 0 / tie 1。')
  })

  it('builds a compact current-state summary', () => {
    const summary = buildProductStateSummary({
      version: '0.5.21',
      releaseTitle: 'feat: current-state sync',
      dataSnapshot: {
        personas: 2,
        sources: 37,
        approvedUnits: 59,
        unitsByPersona: { lenny: 37, zhang: 22 },
        animaBaseHead: '083974d',
      },
      changes: ['完成项一', '完成项二', '完成项三'],
    })

    expect(summary).toContain('2 个决策 persona')
    expect(summary).toContain('37 sources / 59 approved units')
    expect(summary).toContain('feat: current-state sync')
    expect(summary).toContain('完成项一；完成项二')
  })
})
