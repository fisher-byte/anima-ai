import { describe, expect, it } from 'vitest'

import type { DecisionRecord } from '@shared/types'

import { buildDecisionListTitle, buildDecisionPreviewLine, stripLeadingMentions } from '../decisionDisplay'

function baseRecord(partial: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: 'd1',
    personaId: 'lenny',
    mode: 'decision',
    decisionType: 'x',
    userQuestion: '',
    knowns: [],
    unknowns: [],
    options: [],
    recommendationSummary: '',
    keyTradeoffs: [],
    assumptions: [],
    followUpQuestions: [],
    nextActions: [],
    evidenceRefs: [],
    status: 'adopted',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('decisionDisplay', () => {
  it('stripLeadingMentions removes @persona prefixes', () => {
    expect(stripLeadingMentions('@Lenny Rachitsky 对于工作怎么思考？')).toBe('对于工作怎么思考？')
  })

  it('buildDecisionListTitle prefers Chinese decisionType over raw user line', () => {
    const r = baseRecord({
      decisionType: '职业与第一份工作节奏',
      userQuestion: '@Lenny 随便问一句很长的占位符用来测试截断功能是否正常工作',
    })
    expect(buildDecisionListTitle(r, r.userQuestion)).toContain('职业与第一份工作')
  })

  it('buildDecisionListTitle falls back to stripped question when decisionType is internal slug', () => {
    const r = baseRecord({
      decisionType: 'career',
      userQuestion: '@Lenny Rachitsky 怎么想职业方向？',
    })
    expect(buildDecisionListTitle(r, r.userQuestion)).toBe('怎么想职业方向？')
  })

  it('buildDecisionPreviewLine uses recommendationSummary first line', () => {
    const r = baseRecord({
      recommendationSummary: '先做三次小实验。\n第二段不应出现。',
      userQuestion: 'ignored for preview',
    })
    expect(buildDecisionPreviewLine(r)).toBe('先做三次小实验。')
  })
})
