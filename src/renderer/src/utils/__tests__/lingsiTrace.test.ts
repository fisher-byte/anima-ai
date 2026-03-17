import { describe, expect, it } from 'vitest'
import type { DecisionSourceRef, DecisionUnit } from '@shared/types'
import {
  fallbackDecisionUnitLabel,
  formatLingSiSourceLabel,
  injectLingSiInlineCitations,
  resolveDecisionUnitLabels,
} from '../lingsiTrace'

const mockUnit = (id: string, title: string): DecisionUnit => ({
  id,
  personaId: 'lenny',
  title,
  summary: 'summary',
  scenario: 'scenario',
  tags: [],
  triggerKeywords: [],
  reasoningSteps: [],
  reasons: [],
  followUpQuestions: [],
  nextActions: [],
  evidenceLevel: 'A',
  sourceRefs: [],
  status: 'approved',
  createdAt: '2026-03-17T00:00:00.000Z',
  updatedAt: '2026-03-17T00:00:00.000Z',
})

describe('lingsiTrace helpers', () => {
  it('falls back to a readable label when a unit title is missing', () => {
    expect(fallbackDecisionUnitLabel('lenny-rice-prioritize-with-confidence')).toBe('Rice Prioritize With Confidence')
  })

  it('resolves matched unit ids to titles in order', () => {
    const labels = resolveDecisionUnitLabels(
      ['unit-2', 'unit-1'],
      [mockUnit('unit-1', 'First Unit'), mockUnit('unit-2', 'Second Unit')],
    )

    expect(labels).toEqual(['Second Unit', 'First Unit'])
  })

  it('formats a source label with title, file name, and locator', () => {
    const ref: DecisionSourceRef = {
      id: 'src-1',
      label: 'PMF talk',
      title: 'Find PMF Before Growth',
      type: 'podcast_transcript',
      path: 'people/product/lenny/podcasts/2024-01-01-pmf.md',
      locator: 'L40-L44',
      evidenceLevel: 'A',
    }

    expect(formatLingSiSourceLabel(ref)).toBe('Find PMF Before Growth · 2024-01-01-pmf.md · L40-L44')
  })

  it('injects inline citations into the first plain paragraph', () => {
    const refs: DecisionSourceRef[] = [
      {
        id: 'src-1',
        label: 'First source',
        type: 'framework',
        path: 'frameworks/a.md',
        evidenceLevel: 'A',
      },
      {
        id: 'src-2',
        label: 'Second source',
        type: 'framework',
        path: 'frameworks/b.md',
        evidenceLevel: 'B',
      },
    ]

    const markdown = '# 标题\n\n先直接聚焦最小可验证路径。'
    expect(injectLingSiInlineCitations(markdown, refs)).toContain('先直接聚焦最小可验证路径。 [1](#lingsi-source-1) [2](#lingsi-source-2)')
  })

  it('does not duplicate inline citations when already injected', () => {
    const ref: DecisionSourceRef = {
      id: 'src-1',
      label: 'First source',
      type: 'framework',
      path: 'frameworks/a.md',
      evidenceLevel: 'A',
    }

    const markdown = '结论先行。 [1](#lingsi-source-1)'
    expect(injectLingSiInlineCitations(markdown, [ref])).toBe(markdown)
  })
})
