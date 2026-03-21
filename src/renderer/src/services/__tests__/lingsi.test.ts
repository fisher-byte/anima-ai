import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStorageRead = vi.fn()
const mockStorageWrite = vi.fn()

vi.mock('../storageService', () => ({
  storageService: {
    read: (...args: unknown[]) => mockStorageRead(...args),
    write: (...args: unknown[]) => mockStorageWrite(...args),
  },
}))

describe('lingsi service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageWrite.mockResolvedValue(true)
  })

  it('rewrites bundled assets when any LingSi seed file is missing from storage', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'decision-units.json') return '[]'
      return null
    })

    const { ensureLingSiStorageSeeded } = await import('../lingsi')
    await ensureLingSiStorageSeeded()

    expect(mockStorageWrite).toHaveBeenCalledTimes(4)
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-personas.json', expect.any(String))
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-source-manifest.json', expect.any(String))
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-product-state.json', expect.any(String))
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-units.json', expect.any(String))
  })

  it('reuses stored LingSi assets when all four files are present and parseable', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'decision-personas.json') return '[]'
      if (filename === 'decision-source-manifest.json') return '[]'
      if (filename === 'decision-product-state.json') {
        return '{"id":"state-1","version":"0.5.49","updatedAt":"2026-03-21T00:00:00.000Z","summary":"current state","keywords":["anima"],"completedChanges":["done"],"currentFocus":["focus"],"validatedDirections":["validated"],"knownRisks":["risk"],"nextDecisions":["next"],"evalSummary":{"lenny":"decision 14 / normal 1"},"docRefs":["docs/PROJECT.md"]}'
      }
      if (filename === 'decision-units.json') return '[{"id":"unit-1","personaId":"lenny","title":"t","summary":"s","scenario":"x","tags":[],"triggerKeywords":[],"reasoningSteps":[],"reasons":[],"followUpQuestions":[],"nextActions":[],"evidenceLevel":"B","sourceRefs":[],"status":"approved","createdAt":"2026-03-17T00:00:00.000Z","updatedAt":"2026-03-17T00:00:00.000Z"}]'
      return null
    })

    const { ensureLingSiStorageSeeded, loadDecisionUnits, loadDecisionProductState } = await import('../lingsi')
    await ensureLingSiStorageSeeded()
    const units = await loadDecisionUnits()
    const state = await loadDecisionProductState()

    expect(mockStorageWrite).not.toHaveBeenCalled()
    expect(units).toHaveLength(1)
    expect(units[0].id).toBe('unit-1')
    expect(state.id).toBe('state-1')
  })

  it('filters payload generation by persona', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'decision-personas.json') return '[]'
      if (filename === 'decision-source-manifest.json') return '[]'
      if (filename === 'decision-product-state.json') {
        return JSON.stringify({
          id: 'product-state',
          version: '0.5.19',
          updatedAt: '2026-03-18T00:00:00.000Z',
          summary: 'Anima 正在收口主页 @persona 决策调用和决策轨迹体验。',
          keywords: ['anima', '主页', '@', '决策', '轨迹'],
          completedChanges: ['主页 @persona 已支持决策模式。'],
          currentFocus: ['让 persona 理解当前产品状态。'],
          validatedDirections: ['前端命名改成决策更易理解。'],
          knownRisks: ['当前产品状态仍需持续同步。'],
          nextDecisions: ['是否给所有 persona 接入产品状态包。'],
          evalSummary: { zhang: 'decision 6 / normal 0 / tie 1' },
          personaFocus: {
            zhang: ['从交互自然性和入口克制的角度判断当前项目。'],
          },
          docRefs: ['docs/PROJECT.md'],
        })
      }
      if (filename === 'decision-units.json') {
        return JSON.stringify([
          {
            id: 'lenny-unit',
            personaId: 'lenny',
            title: 'Lenny Unit',
            summary: 's',
            scenario: '定价讨论',
            tags: ['pricing'],
            triggerKeywords: ['定价'],
            reasoningSteps: [],
            reasons: [],
            followUpQuestions: [],
            nextActions: [],
            evidenceLevel: 'B',
            sourceRefs: [],
            status: 'approved',
            createdAt: '2026-03-17T00:00:00.000Z',
            updatedAt: '2026-03-17T00:00:00.000Z',
          },
          {
            id: 'zhang-unit',
            personaId: 'zhang',
            title: 'Zhang Unit',
            summary: 's',
            scenario: '定价讨论',
            tags: ['pricing'],
            triggerKeywords: ['定价'],
            reasoningSteps: [],
            reasons: [],
            followUpQuestions: [],
            nextActions: [],
            evidenceLevel: 'B',
            sourceRefs: [],
            status: 'approved',
            createdAt: '2026-03-17T00:00:00.000Z',
            updatedAt: '2026-03-17T00:00:00.000Z',
          },
        ])
      }
      return null
    })

    const { buildLingSiDecisionPayload, loadDecisionUnits } = await import('../lingsi')
    const zhangUnits = await loadDecisionUnits('zhang')
    const payload = await buildLingSiDecisionPayload('Anima 主页上的 @ 和决策轨迹交互还应该怎么改？', 'decision', {
      personaId: 'zhang',
      personaName: '张小龙',
    })

    expect(zhangUnits.map(unit => unit.id)).toEqual(['zhang-unit'])
    expect(payload.decisionTrace.personaId).toBe('zhang')
    expect(payload.decisionTrace.matchedDecisionUnitIds).toEqual([])
    expect(payload.extraContext).toContain('以 张小龙 的方式回答')
    expect(payload.extraContext).toContain('当前产品状态包')
  })
})
