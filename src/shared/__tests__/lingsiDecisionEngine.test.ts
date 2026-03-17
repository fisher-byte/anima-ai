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

  it('matches roadmap stakeholder pressure prompts to the roadmap cutline unit', () => {
    const matched = matchDecisionUnits(
      '我是 4 人产品团队，下季度有 12 个需求，销售、客户成功、CEO 都在施压。路线图怎么排？',
      units,
    )
    expect(matched.map(unit => unit.id)).toContain('lenny-roadmap-cutline-before-stakeholder-pull')
  })

  it('matches retention-first prompts to the retention unit', () => {
    const matched = matchDecisionUnits(
      '我们增长还行，但留存只有 20%，现在还要不要继续加大买量？',
      units,
    )
    expect(matched.map(unit => unit.id)).toContain('lenny-retention-before-acquisition')
  })

  it('matches PLG prompts to the TTV unit', () => {
    const matched = matchDecisionUnits(
      '我们想做 PLG，但注册后用户十几分钟都到不了核心价值，是不是先去投放和做 viral？',
      units,
    )
    expect(matched.map(unit => unit.id)).toContain('lenny-ttv-before-plg-distribution')
  })

  it('builds decision payload with trace and source refs', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      'B2B AI 工具应该按 seat 还是按使用量定价？',
      'decision',
      units,
      {
        personaId: 'lenny',
        personaName: 'Lenny Rachitsky',
      },
    )
    expect(payload.extraContext).toContain('LingSi 决策模式')
    expect(payload.decisionTrace.mode).toBe('decision')
    expect(payload.decisionTrace.personaId).toBe('lenny')
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('lenny-pricing-start-with-value-metric')
    expect(payload.decisionTrace.sourceRefs?.[0]?.locator).toBeTruthy()
  })

  it('merges traces without duplicating unit ids', () => {
    const first = buildLingSiDecisionPayloadFromUnits('路线图优先级怎么排？', 'decision', units, { personaId: 'lenny' }).decisionTrace
    const second = buildLingSiDecisionPayloadFromUnits('路线图优先级还是用 RICE 吗？', 'decision', units, { personaId: 'lenny' }).decisionTrace
    const merged = mergeDecisionTrace(first, second)
    expect(merged.mode).toBe('decision')
    expect(merged.personaId).toBe('lenny')
    expect(merged.matchedDecisionUnitIds?.filter(id => id === 'lenny-rice-prioritize-with-confidence')).toHaveLength(1)
  })

  it('scopes matching to the selected persona', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '如何做一个争议较大的信息流改版？',
      'decision',
      units,
      { personaId: 'zhang', personaName: '张小龙' },
    )
    expect(payload.decisionTrace.personaId).toBe('zhang')
    expect(payload.decisionTrace.matchedDecisionUnitIds?.some(id => id.startsWith('zhang-'))).toBe(true)
    expect(payload.decisionTrace.matchedDecisionUnitIds?.some(id => id.startsWith('lenny-'))).toBe(false)
    expect(payload.extraContext).toContain('以 张小龙 的方式回答')
  })

  it('matches Zhang restraint prompts to Zhang-only governance units', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '为了拉活跃，我们要不要给发现页和内容流都加红点和 push？',
      'decision',
      units,
      { personaId: 'zhang', personaName: '张小龙' },
    )
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('zhang-operate-with-restraint-not-kpi-anxiety')
    expect(payload.decisionTrace.matchedDecisionUnitIds?.some(id => id.startsWith('lenny-'))).toBe(false)
  })

  it('matches Zhang service entry prompts to mini-program scene units', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '这个线下服务到底该不该抢首页入口，还是应该让用户在扫码和真实场景里直接触发？',
      'decision',
      units,
      { personaId: 'zhang', personaName: '张小龙' },
    )
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('zhang-scene-entry-beats-homepage-entry-for-services')
    expect(payload.decisionTrace.matchedDecisionUnitIds?.some(id => id.startsWith('lenny-'))).toBe(false)
  })
})
