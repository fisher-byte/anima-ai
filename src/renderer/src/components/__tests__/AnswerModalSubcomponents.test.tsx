import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { DecisionSourceRef, DecisionUnit } from '@shared/types'
import { LingSiTracePanel } from '../AnswerModalSubcomponents'

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

describe('LingSiTracePanel', () => {
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
})
