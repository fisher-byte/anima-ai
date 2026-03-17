import { describe, expect, it } from 'vitest'
import {
  buildMentionTokenText,
  findMentionTokenRange,
  getActiveSpaceMention,
  removeMentionTokenFromMessage,
  replaceActiveMentionQuery,
  syncMentionTokens,
  type InputMentionToken,
} from '../inputMentions'

function token(overrides: Partial<InputMentionToken>): InputMentionToken {
  return {
    id: '1',
    type: 'space',
    entityId: 'lenny',
    label: 'Lenny Rachitsky',
    tokenText: '@Lenny Rachitsky〔决策〕 ',
    mode: 'decision',
    invocationType: 'public_space',
    supportsDecisionMode: true,
    ...overrides,
  }
}

describe('inputMentions', () => {
  it('builds decision token text with mode label', () => {
    expect(buildMentionTokenText('张小龙', 'decision', '决策')).toBe('@张小龙〔决策〕 ')
    expect(buildMentionTokenText('张小龙', 'normal')).toBe('@张小龙 ')
  })

  it('can build decision token text without showing the mode label', () => {
    expect(buildMentionTokenText('Lenny Rachitsky', 'decision', '决策', false)).toBe('@Lenny Rachitsky ')
  })

  it('replaces the active @ query with the token text', () => {
    const result = replaceActiveMentionQuery('请 @len 帮我看一下', 6, '@Lenny Rachitsky ')
    expect(result.message).toBe('请 @Lenny Rachitsky 帮我看一下')
    expect(result.cursor).toBe('请 @Lenny Rachitsky '.length)
  })

  it('removes stale mention tokens after manual edits', () => {
    const tokens = [
      token({ id: 'a', tokenText: '@Lenny Rachitsky ' }),
      token({ id: 'b', tokenText: '@张小龙〔决策〕 ', label: '张小龙', entityId: 'zhang' }),
    ]
    expect(syncMentionTokens('先问 @张小龙〔决策〕', tokens)).toHaveLength(1)
  })

  it('finds and removes a whole token on backspace', () => {
    const tokens = [token({ tokenText: '@张小龙〔决策〕 ', label: '张小龙', entityId: 'zhang' })]
    const message = '请 @张小龙〔决策〕 帮我看一下'
    const cursor = '请 @张小龙〔决策〕'.length
    const range = findMentionTokenRange(message, tokens, cursor, 'Backspace')
    expect(range).not.toBeNull()
    const next = removeMentionTokenFromMessage(message, { start: range!.start, end: range!.end })
    expect(next.message).toBe('请 帮我看一下')
  })

  it('returns the last mentioned space as active invocation', () => {
    const active = getActiveSpaceMention([
      token({ id: '1', label: 'Lenny Rachitsky', entityId: 'lenny', tokenText: '@Lenny Rachitsky ' }),
      token({ id: '2', label: '张小龙', entityId: 'zhang', tokenText: '@张小龙〔决策〕 ' }),
    ])
    expect(active?.entityId).toBe('zhang')
  })
})
