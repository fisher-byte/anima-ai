import { describe, expect, it } from 'vitest'
import decisionUnitsSeed from '../../../seeds/lingsi/decision-units.json'
import {
  buildLingSiDecisionPayloadFromUnits,
  matchDecisionUnits,
  mergeDecisionTrace,
} from '../lingsiDecisionEngine'
import type { DecisionUnit } from '../types'

const units = decisionUnitsSeed as DecisionUnit[]

describe('lingsiDecisionEngine', () => {
  it('matches expected units for aligned prompts', () => {
    const matched = matchDecisionUnits('我们该先验证 PMF 还是先砸增长渠道？', units)
    expect(matched[0]?.id).toBe('lenny-pmf-validate-before-growth')
  })

  it('builds decision payload with trace and source refs', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      'B2B AI 工具应该按 seat 还是按使用量定价？',
      'decision',
      units,
    )
    expect(payload.extraContext).toContain('LingSi 决策模式')
    expect(payload.decisionTrace.mode).toBe('decision')
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('lenny-pricing-start-with-value-metric')
    expect(payload.decisionTrace.sourceRefs?.[0]?.locator).toBeTruthy()
  })

  it('merges traces without duplicating unit ids', () => {
    const first = buildLingSiDecisionPayloadFromUnits('路线图优先级怎么排？', 'decision', units).decisionTrace
    const second = buildLingSiDecisionPayloadFromUnits('路线图优先级还是用 RICE 吗？', 'decision', units).decisionTrace
    const merged = mergeDecisionTrace(first, second)
    expect(merged.mode).toBe('decision')
    expect(merged.matchedDecisionUnitIds?.filter(id => id === 'lenny-rice-prioritize-with-confidence')).toHaveLength(1)
  })
})
