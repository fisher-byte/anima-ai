import { describe, expect, it } from 'vitest'
import type { Node } from '@shared/types'
import { getMemoryCardVariant } from '../nodeCardVariants'

function node(partial: Partial<Node> & Pick<Node, 'id' | 'title' | 'conversationId' | 'x' | 'y'>): Node {
  return {
    keywords: [],
    date: '2026-01-01',
    ...partial,
  }
}

describe('getMemoryCardVariant', () => {
  it('returns person for 情感关系', () => {
    expect(
      getMemoryCardVariant(
        node({ id: '1', title: 'x', conversationId: 'c', x: 0, y: 0, category: '情感关系' })
      )
    ).toBe('person')
  })

  it('returns task for 工作事业', () => {
    expect(
      getMemoryCardVariant(
        node({ id: '1', title: 'x', conversationId: 'c', x: 0, y: 0, category: '工作事业' })
      )
    ).toBe('task')
  })

  it('uses topicLabel heuristics', () => {
    expect(
      getMemoryCardVariant(
        node({
          id: '1',
          title: 'x',
          conversationId: 'c',
          x: 0,
          y: 0,
          category: '其他',
          topicLabel: '和朋友聊天',
        })
      )
    ).toBe('person')
  })

  it('capability nodes are neutral', () => {
    expect(
      getMemoryCardVariant(
        node({
          id: '1',
          title: 'x',
          conversationId: 'c',
          x: 0,
          y: 0,
          nodeType: 'capability',
          capabilityData: { capabilityId: 'onboarding', state: 'active' },
        })
      )
    ).toBe('neutral')
  })
})
