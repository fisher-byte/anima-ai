import { describe, expect, it } from 'vitest'
import decisionUnitsSeed from '../../../seeds/lingsi/decision-units.json'
import decisionPersonasSeed from '../../../seeds/lingsi/decision-personas.json'
import decisionProductStateSeed from '../../../seeds/lingsi/decision-product-state.json'
import {
  buildLingSiDecisionPayloadFromUnits,
  matchDecisionUnits,
  mergeDecisionTrace,
  shouldInjectDecisionProductState,
} from '../lingsiDecisionEngine'
import type { DecisionPersona, DecisionProductStatePack, DecisionUnit } from '../types'

const units = decisionUnitsSeed as DecisionUnit[]
const personas = decisionPersonasSeed as DecisionPersona[]
const productState = decisionProductStateSeed as DecisionProductStatePack

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

  it('matches AI eval prompts to the open-coding eval unit', () => {
    const matched = matchDecisionUnits(
      '我们这个 AI 产品 prompt 改来改去像猜谜，没有统一评测标准，应该怎么建 eval？',
      units,
    )
    expect(matched.map(unit => unit.id)).toContain('lenny-open-code-real-failures-before-eval-rubric')
  })

  it('builds decision payload with trace and source refs', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      'B2B AI 工具应该按 seat 还是按使用量定价？',
      'decision',
      units,
      {
        personaId: 'lenny',
        personaName: 'Lenny Rachitsky',
        persona: personas.find(item => item.id === 'lenny'),
      },
    )
    expect(payload.extraContext).toContain('LingSi 决策模式')
    expect(payload.extraContext).toContain('Persona 决策画像')
    expect(payload.extraContext).toContain('优先框架')
    expect(payload.decisionTrace.mode).toBe('decision')
    expect(payload.decisionTrace.personaId).toBe('lenny')
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('lenny-pricing-start-with-value-metric')
    expect(payload.decisionTrace.sourceRefs?.[0]?.locator).toBeTruthy()
    expect(payload.decisionTrace.reasoningRoute?.decisionType).toBeTruthy()
    expect(payload.decisionTrace.reasoningRoute?.chosenFrameworks?.length).toBeGreaterThan(0)
    expect(payload.decisionRecord?.personaId).toBe('lenny')
    expect(payload.decisionRecord?.decisionType).toBe(payload.decisionTrace.reasoningRoute?.decisionType)
    expect(payload.decisionRecord?.status).toBe('draft')
    expect(payload.decisionRecord?.followUpQuestions?.length).toBeGreaterThan(0)
  })

  it('injects the product state pack for current-project prompts', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      'Anima 现在主页上的 @persona 决策入口和查看轨迹设计，你觉得还应该怎么改？',
      'decision',
      units,
      {
        personaId: 'lenny',
        personaName: 'Lenny Rachitsky',
        persona: personas.find(item => item.id === 'lenny'),
        productState,
      },
    )
    expect(payload.extraContext).toContain('当前产品状态包')
    expect(payload.extraContext).toContain('知识基线')
    expect(payload.extraContext).toContain('当前关注')
    expect(payload.extraContext).toContain('anima-base: 083974d')
    expect(payload.decisionTrace.productStateUsed).toBe(true)
    expect(payload.decisionTrace.productStateDocRefs?.length).toBeGreaterThan(0)
    expect(payload.decisionRecord?.knowns).toContain('已注入当前项目状态作为判断背景')
  })

  it('does not inject the product state pack for unrelated generic prompts', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '我们给 B2B AI 工具按 seat 还是按使用量收费？',
      'decision',
      units,
      {
        personaId: 'lenny',
        personaName: 'Lenny Rachitsky',
        persona: personas.find(item => item.id === 'lenny'),
        productState,
      },
    )
    expect(payload.extraContext).not.toContain('当前产品状态包')
    expect(payload.decisionTrace.productStateUsed).toBeFalsy()
  })

  it('does not let appended space hints accidentally trigger the product state pack', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '@Lenny Rachitsky 怎么思考职业发展方向？\n\n【已关联空间：Lenny Rachitsky（灵思）—— 请以 Lenny Rachitsky 的视角和知识来回答，可调用 search_memory 检索相关记忆】',
      'decision',
      units,
      {
        personaId: 'lenny',
        personaName: 'Lenny Rachitsky',
        persona: personas.find(item => item.id === 'lenny'),
        productState,
      },
    )
    expect(payload.extraContext).not.toContain('当前产品状态包')
    expect(payload.decisionTrace.productStateUsed).toBeFalsy()
    expect(payload.decisionTrace.reasoningRoute?.followUpRequired).toBe(true)
    expect(payload.decisionTrace.reasoningRoute?.keyUnknowns?.length).toBeGreaterThan(0)
  })

  it('merges traces without duplicating unit ids', () => {
    const first = buildLingSiDecisionPayloadFromUnits('路线图优先级怎么排？', 'decision', units, { personaId: 'lenny' }).decisionTrace
    const second = buildLingSiDecisionPayloadFromUnits('路线图优先级还是用 RICE 吗？', 'decision', units, { personaId: 'lenny' }).decisionTrace
    const merged = mergeDecisionTrace(first, second)
    expect(merged.mode).toBe('decision')
    expect(merged.personaId).toBe('lenny')
    expect(merged.matchedDecisionUnitIds?.filter(id => id === 'lenny-rice-prioritize-with-confidence')).toHaveLength(1)
  })

  it('mergeDecisionTrace keeps existing decision when payload is normal (same persona)', () => {
    const existing = buildLingSiDecisionPayloadFromUnits('路线图优先级怎么排？', 'decision', units, { personaId: 'lenny' }).decisionTrace
    const merged = mergeDecisionTrace(existing, { mode: 'normal', personaId: 'lenny' })
    expect(merged.mode).toBe('decision')
    expect(merged.personaId).toBe('lenny')
    expect(merged.matchedDecisionUnitIds?.length).toBeGreaterThan(0)
  })

  it('mergeDecisionTrace applies normal when there is no existing decision trace', () => {
    expect(mergeDecisionTrace(undefined, { mode: 'normal', personaId: 'lenny' })).toEqual({
      mode: 'normal',
      personaId: 'lenny',
    })
  })

  it('merges product state trace metadata without duplicating doc refs', () => {
    const first = buildLingSiDecisionPayloadFromUnits(
      'Anima 当前这个项目最该先做什么？',
      'decision',
      units,
      { personaId: 'lenny', personaName: 'Lenny', productState },
    ).decisionTrace
    const second = buildLingSiDecisionPayloadFromUnits(
      'Anima 这个项目的下一步产品节奏怎么排？',
      'decision',
      units,
      { personaId: 'lenny', personaName: 'Lenny', productState },
    ).decisionTrace
    const merged = mergeDecisionTrace(first, second)
    expect(merged.productStateUsed).toBe(true)
    expect(new Set(merged.productStateDocRefs ?? []).size).toBe(merged.productStateDocRefs?.length)
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
    expect(payload.decisionTrace.reasoningRoute?.chosenFrameworks).toContain('scene-before-feature')
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

  it('matches Zhang tooltip-heavy prompts to the no-tips unit', () => {
    const payload = buildLingSiDecisionPayloadFromUnits(
      '这个新功能用户总看不懂，我们要不要加更多 tooltip 和新手引导说明？',
      'decision',
      units,
      { personaId: 'zhang', personaName: '张小龙' },
    )
    expect(payload.decisionTrace.matchedDecisionUnitIds).toContain('zhang-no-tips-means-the-interaction-is-natural')
    expect(payload.decisionTrace.matchedDecisionUnitIds?.some(id => id.startsWith('lenny-'))).toBe(false)
  })

  it('detects whether a prompt should receive the product state pack', () => {
    expect(shouldInjectDecisionProductState('Anima 首页 Space 卡片和决策轨迹还有什么交互问题？', productState)).toBe(true)
    expect(shouldInjectDecisionProductState('企业软件怎么缩短续费反馈回路？', productState)).toBe(false)
    expect(shouldInjectDecisionProductState('这个功能交互不好，该怎么设计？', productState)).toBe(false)
    expect(shouldInjectDecisionProductState('@Lenny Rachitsky 怎么思考职业发展方向？\n\n【已关联空间：Lenny Rachitsky（灵思）—— 请以 Lenny Rachitsky 的视角和知识来回答，可调用 search_memory 检索相关记忆】', productState)).toBe(false)
  })
})
