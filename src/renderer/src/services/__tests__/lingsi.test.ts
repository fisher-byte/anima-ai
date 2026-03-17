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

    expect(mockStorageWrite).toHaveBeenCalledTimes(3)
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-personas.json', expect.any(String))
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-source-manifest.json', expect.any(String))
    expect(mockStorageWrite).toHaveBeenCalledWith('decision-units.json', expect.any(String))
  })

  it('reuses stored LingSi assets when all three files are present and parseable', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'decision-personas.json') return '[]'
      if (filename === 'decision-source-manifest.json') return '[]'
      if (filename === 'decision-units.json') return '[{"id":"unit-1","personaId":"lenny","title":"t","summary":"s","scenario":"x","tags":[],"triggerKeywords":[],"reasoningSteps":[],"reasons":[],"followUpQuestions":[],"nextActions":[],"evidenceLevel":"B","sourceRefs":[],"status":"approved","createdAt":"2026-03-17T00:00:00.000Z","updatedAt":"2026-03-17T00:00:00.000Z"}]'
      return null
    })

    const { ensureLingSiStorageSeeded, loadDecisionUnits } = await import('../lingsi')
    await ensureLingSiStorageSeeded()
    const units = await loadDecisionUnits()

    expect(mockStorageWrite).not.toHaveBeenCalled()
    expect(units).toHaveLength(1)
    expect(units[0].id).toBe('unit-1')
  })

  it('filters payload generation by persona', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'decision-personas.json') return '[]'
      if (filename === 'decision-source-manifest.json') return '[]'
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
    const payload = await buildLingSiDecisionPayload('定价怎么做？', 'decision', {
      personaId: 'zhang',
      personaName: '张小龙',
    })

    expect(zhangUnits.map(unit => unit.id)).toEqual(['zhang-unit'])
    expect(payload.decisionTrace.personaId).toBe('zhang')
    expect(payload.decisionTrace.matchedDecisionUnitIds).toEqual(['zhang-unit'])
    expect(payload.extraContext).toContain('以 张小龙 的方式回答')
  })
})
