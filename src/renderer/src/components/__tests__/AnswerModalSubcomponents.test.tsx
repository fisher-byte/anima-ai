import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { DecisionRecord, DecisionSourceRef, DecisionUnit } from '@shared/types'
import { LingSiDecisionCard, LingSiTracePanel, UserMessageContent } from '../AnswerModalSubcomponents'

const matchedUnit: DecisionUnit = {
  id: 'lenny-pre-mortem-needs-kill-criteria',
  personaId: 'lenny',
  title: '做 pre-mortem 时一定要配 kill criteria',
  summary: '先预设失败触发条件，别把 pre-mortem 做成纯讨论。',
  scenario: '团队要给高风险项目做预演。',
  tags: ['decision'],
  triggerKeywords: ['pre-mortem'],
  reasoningSteps: ['先定义失败条件'],
  reasons: ['这样才能在失败出现时执行。'],
  followUpQuestions: ['如果失败了，什么信号会触发停手？'],
  nextActions: ['写下 kill criteria。'],
  evidenceLevel: 'A',
  sourceRefs: [],
  status: 'approved',
  confidence: 0.9,
  createdAt: '2026-03-18T00:00:00.000Z',
  updatedAt: '2026-03-18T00:00:00.000Z',
}

const sourceRef: DecisionSourceRef = {
  id: 'src-lenny-annie-duke',
  label: 'Annie Duke on Better Decisions',
  type: 'podcast_transcript',
  path: 'people/product/lenny-rachitsky/podcasts/2024-05-02-annie-duke.md',
  person: 'Annie Duke',
  title: 'This will make you a better decision maker',
  locator: 'L418',
  excerpt: 'Use the pre-mortem to set up kill criteria.',
  evidenceLevel: 'A',
}

const decisionRecord: DecisionRecord = {
  id: 'decision-1',
  personaId: 'lenny',
  mode: 'decision',
  decisionType: 'career',
  stage: 'early',
  userQuestion: '怎么想职业方向？',
  knowns: ['第一份工作'],
  unknowns: ['还没做过足够多的探索'],
  options: [],
  recommendedOptionId: undefined,
  recommendationSummary: '先去做三次真实的小实验，再决定长期方向。',
  keyTradeoffs: ['确定性 vs 探索空间'],
  assumptions: [],
  followUpQuestions: ['你已经试过哪些方向？'],
  nextActions: ['做 3 个小实验', '和 3 个相关岗位的人聊聊'],
  killCriteria: [],
  evidenceRefs: [sourceRef],
  status: 'answered',
  createdAt: '2026-03-18T00:00:00.000Z',
  updatedAt: '2026-03-18T00:00:00.000Z',
}

describe('LingSiTracePanel', () => {
  it('hides injected space hints from rendered user messages', () => {
    const html = renderToStaticMarkup(
      <UserMessageContent content="@Lenny Rachitsky 职业发展怎么想？\n\n【已关联空间：Lenny Rachitsky（灵思）—— 请以 Lenny Rachitsky 的视角和知识来回答，可调用 search_memory 检索相关记忆】" />,
    )

    expect(html).toContain('@Lenny Rachitsky 职业发展怎么想？')
    expect(html).not.toContain('已关联空间')
    expect(html).not.toContain('search_memory')
  })

  it('renders a disabled trace action while the answer is still streaming', () => {
    const html = renderToStaticMarkup(
      <LingSiTracePanel
        mode="decision"
        personaName="Lenny Rachitsky"
        matchedUnits={[matchedUnit]}
        sourceRefs={[sourceRef]}
        isStreaming
      />,
    )

    expect(html).toContain('disabled=""')
    expect(html).toContain('决策依据')
    expect(html).toContain('查看轨迹')
  })

  it('renders product-state trace even without matched source refs', () => {
    const html = renderToStaticMarkup(
      <LingSiTracePanel
        mode="decision"
        personaName="Lenny Rachitsky"
        matchedUnits={[]}
        sourceRefs={[]}
        productStateDocRefs={['docs/PROJECT.md', 'docs/lingsi-flywheel.md']}
        defaultExpanded
      />,
    )

    expect(html).toContain('当前项目状态')
    expect(html).toContain('这次没有命中具体案例')
    expect(html).not.toContain('docs/PROJECT.md')
  })

  it('renders the decision card collapsed by default showing summary', () => {
    const html = renderToStaticMarkup(
      <LingSiDecisionCard
        record={decisionRecord}
        personaName="Lenny Rachitsky"
        onAdopt={() => {}}
        onOutcome={() => {}}
      />,
    )

    // Card should render with the recommendation summary visible in collapsed state
    expect(html).toContain('决策卡')
    expect(html).toContain('先去做三次真实的小实验，再决定长期方向。')
    expect(html).toContain('Lenny Rachitsky')
    // Adopt/revisit actions are hidden until expanded (collapsed by default)
    expect(html).not.toContain('采纳建议')
  })
})
