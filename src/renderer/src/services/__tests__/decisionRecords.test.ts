import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStorageRead = vi.fn()

vi.mock('../storageService', () => ({
  storageService: {
    read: (...args: unknown[]) => mockStorageRead(...args),
  },
}))

describe('decisionRecords service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockStorageRead.mockReset()
  })

  it('collects adopted decision records and synthesizes public-space metadata', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'lenny-conversations.jsonl') {
        return [
          JSON.stringify({
            id: 'conv-lenny-1',
            createdAt: '2026-03-18T00:00:00.000Z',
            userMessage: '@Lenny Rachitsky 怎么想职业方向？',
            assistantMessage: '先去做三次真实的小实验。',
            decisionRecord: {
              id: 'decision-1',
              personaId: 'lenny',
              mode: 'decision',
              decisionType: 'career',
              userQuestion: '@Lenny Rachitsky 怎么想职业方向？',
              knowns: [],
              unknowns: [],
              options: [],
              recommendationSummary: '先去做三次真实的小实验。',
              keyTradeoffs: [],
              assumptions: [],
              followUpQuestions: [],
              nextActions: ['做三次实验'],
              evidenceRefs: [],
              status: 'adopted',
              outcome: { adoptedAt: '2026-03-18T06:00:00.000Z', revisitAt: '2026-03-25T00:00:00.000Z' },
              createdAt: '2026-03-18T00:00:00.000Z',
              updatedAt: '2026-03-18T10:00:00.000Z',
            },
          }),
        ].join('\n')
      }
      if (filename === 'conversations.jsonl') {
        return [
          JSON.stringify({
            id: 'conv-main-1',
            createdAt: '2026-03-18T00:00:00.000Z',
            userMessage: '这个决策已经回访了',
            assistantMessage: '继续收缩。',
            invokedAssistant: { type: 'public_space', id: 'zhang', name: '张小龙', mode: 'decision' },
            decisionRecord: {
              id: 'decision-2',
              personaId: 'zhang',
              mode: 'decision',
              decisionType: 'product_strategy',
              userQuestion: '这个决策已经回访了',
              knowns: [],
              unknowns: [],
              options: [],
              recommendationSummary: '继续收缩。',
              keyTradeoffs: [],
              assumptions: [],
              followUpQuestions: [],
              nextActions: [],
              evidenceRefs: [],
              status: 'revisited',
              outcome: { revisitAt: '2026-03-20T00:00:00.000Z', result: 'mixed', notes: '用户执行了一半。' },
              createdAt: '2026-03-18T00:00:00.000Z',
              updatedAt: '2026-03-18T08:00:00.000Z',
            },
          }),
        ].join('\n')
      }
      return null
    })

    const { listOngoingDecisionItems } = await import('../decisionRecords')
    const items = await listOngoingDecisionItems()

    expect(items).toHaveLength(2)
    expect(items[0].conversation?.invokedAssistant?.id).toBe('zhang')
    expect(items[1].conversation?.invokedAssistant?.id).toBe('lenny')
    expect(items[1].title).toContain('怎么想职业方向')
    expect(items[0].notes).toBe('用户执行了一半。')
    expect(items[1].adoptedAt).toBe('2026-03-18T06:00:00.000Z')
  })

  it('marks adopted decisions as due when revisit time has passed and sorts ledger by freshness', async () => {
    mockStorageRead.mockImplementation(async (filename: string) => {
      if (filename === 'conversations.jsonl') {
        return [
          JSON.stringify({
            id: 'conv-old',
            createdAt: '2026-03-18T00:00:00.000Z',
            userMessage: '旧决策',
            assistantMessage: '旧建议',
            decisionRecord: {
              id: 'decision-old',
              personaId: 'lenny',
              mode: 'decision',
              decisionType: 'career',
              userQuestion: '旧决策',
              knowns: [],
              unknowns: [],
              options: [],
              recommendationSummary: '旧建议',
              keyTradeoffs: [],
              assumptions: [],
              followUpQuestions: [],
              nextActions: [],
              evidenceRefs: [],
              status: 'adopted',
              outcome: { revisitAt: '2026-03-10T00:00:00.000Z' },
              createdAt: '2026-03-18T00:00:00.000Z',
              updatedAt: '2026-03-18T01:00:00.000Z',
            },
          }),
          JSON.stringify({
            id: 'conv-new',
            createdAt: '2026-03-18T00:00:00.000Z',
            userMessage: '新复盘',
            assistantMessage: '新建议',
            decisionRecord: {
              id: 'decision-new',
              personaId: 'zhang',
              mode: 'decision',
              decisionType: 'product_strategy',
              userQuestion: '新复盘',
              knowns: [],
              unknowns: [],
              options: [],
              recommendationSummary: '新建议',
              keyTradeoffs: [],
              assumptions: [],
              followUpQuestions: [],
              nextActions: [],
              evidenceRefs: [],
              status: 'revisited',
              outcome: { revisitAt: '2026-03-19T00:00:00.000Z', result: 'working' },
              createdAt: '2026-03-18T00:00:00.000Z',
              updatedAt: '2026-03-18T12:00:00.000Z',
            },
          }),
        ].join('\n')
      }
      return null
    })

    const { listDecisionLedgerItems } = await import('../decisionRecords')
    const items = await listDecisionLedgerItems()

    expect(items).toHaveLength(2)
    expect(items[0].conversationId).toBe('conv-old')
    expect(items[0].isDue).toBe(true)
    expect(items[1].conversationId).toBe('conv-new')
  })
})
