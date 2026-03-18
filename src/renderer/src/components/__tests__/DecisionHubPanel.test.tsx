import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { OngoingDecisionItem } from '../../services/decisionRecords'
import { DecisionHubPanel } from '../DecisionHubPanel'

const items: OngoingDecisionItem[] = [
  {
    conversationId: 'conv-due',
    conversation: {
      id: 'conv-due',
      createdAt: '2026-03-18T00:00:00.000Z',
      userMessage: '怎么推进首批真实用户验证？',
      assistantMessage: '先安排 5 个访谈。',
    },
    decisionRecord: {
      id: 'decision-due',
      personaId: 'lenny',
      mode: 'decision',
      decisionType: 'product_strategy',
      userQuestion: '怎么推进首批真实用户验证？',
      knowns: [],
      unknowns: [],
      options: [],
      recommendationSummary: '先安排 5 个访谈。',
      keyTradeoffs: [],
      assumptions: [],
      followUpQuestions: [],
      nextActions: ['联系 5 个用户'],
      evidenceRefs: [],
      status: 'adopted',
      outcome: { revisitAt: '2026-03-10T00:00:00.000Z' },
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T09:00:00.000Z',
    },
    personaName: 'Lenny Rachitsky',
    source: 'lenny',
    title: '怎么推进首批真实用户验证？',
    revisitAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-18T09:00:00.000Z',
    isDue: true,
  },
  {
    conversationId: 'conv-reviewed',
    conversation: {
      id: 'conv-reviewed',
      createdAt: '2026-03-18T00:00:00.000Z',
      userMessage: '之前那条建议后来怎么样？',
      assistantMessage: '继续收缩。',
    },
    decisionRecord: {
      id: 'decision-reviewed',
      personaId: 'zhang',
      mode: 'decision',
      decisionType: 'product_strategy',
      userQuestion: '之前那条建议后来怎么样？',
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
      outcome: { revisitAt: '2026-03-20T00:00:00.000Z', result: 'mixed', notes: '用户只执行了一半。' },
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    },
    personaName: '张小龙',
    source: 'main',
    title: '之前那条建议后来怎么样？',
    revisitAt: '2026-03-20T00:00:00.000Z',
    result: 'mixed',
    notes: '用户只执行了一半。',
    updatedAt: '2026-03-18T10:00:00.000Z',
    isDue: false,
  },
]

describe('DecisionHubPanel', () => {
  it('renders due reminders and validation ledger copy', () => {
    const html = renderToStaticMarkup(
      <DecisionHubPanel
        items={items}
        onClose={() => {}}
        onOpenDecision={() => {}}
      />,
    )

    expect(html).toContain('决策追踪')
    expect(html).toContain('今天该回访')
    expect(html).toContain('验证台账')
    expect(html).toContain('用户只执行了一半。')
    expect(html).toContain('Lenny Rachitsky')
  })
})
