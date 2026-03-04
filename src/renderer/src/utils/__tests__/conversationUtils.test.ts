/**
 * Unit tests for conversationUtils.ts
 *
 * Covers:
 *  - compressMemoriesForPrompt
 *  - parseTurnsFromAssistantMessage
 *  - stripLeadingNumberHeading
 *  - buildAIHistory
 */

import { describe, it, expect } from 'vitest'
import {
  compressMemoriesForPrompt,
  parseTurnsFromAssistantMessage,
  stripLeadingNumberHeading,
  buildAIHistory
} from '../conversationUtils'
import type { Conversation } from '../../../../shared/types'

// ── helpers ────────────────────────────────────────────────────────────────

function makeConv(user: string, assistant: string, id = 'c1'): Conversation {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    userMessage: user,
    assistantMessage: assistant
  }
}

// ── compressMemoriesForPrompt ──────────────────────────────────────────────

describe('compressMemoriesForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(compressMemoriesForPrompt([])).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(compressMemoriesForPrompt(null as any)).toBe('')
    expect(compressMemoriesForPrompt(undefined as any)).toBe('')
  })

  it('formats a single memory correctly', () => {
    const result = compressMemoriesForPrompt([{ conv: makeConv('hello', 'world') }])
    expect(result).toContain('用户：hello')
    expect(result).toContain('助手：world')
  })

  it('truncates long userMessage at 80 chars with ellipsis', () => {
    const longUser = 'a'.repeat(100)
    const result = compressMemoriesForPrompt([{ conv: makeConv(longUser, 'ok') }])
    expect(result).toContain('a'.repeat(80) + '…')
    expect(result).not.toContain('a'.repeat(81))
  })

  it('truncates long assistantMessage at 150 chars with ellipsis', () => {
    const longAi = 'b'.repeat(200)
    const result = compressMemoriesForPrompt([{ conv: makeConv('q', longAi) }])
    expect(result).toContain('b'.repeat(150) + '…')
    expect(result).not.toContain('b'.repeat(151))
  })

  it('does NOT add ellipsis when message is within limit', () => {
    const result = compressMemoriesForPrompt([{ conv: makeConv('short', 'answer') }])
    expect(result).not.toContain('…')
  })

  it('joins multiple memories with double newline', () => {
    const memories = [
      { conv: makeConv('q1', 'a1', 'c1') },
      { conv: makeConv('q2', 'a2', 'c2') }
    ]
    const result = compressMemoriesForPrompt(memories)
    expect(result).toContain('用户：q1')
    expect(result).toContain('用户：q2')
    // double newline separator
    expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2)
  })
})

// ── parseTurnsFromAssistantMessage ─────────────────────────────────────────

describe('parseTurnsFromAssistantMessage', () => {
  it('returns null for empty message', () => {
    expect(parseTurnsFromAssistantMessage('')).toBeNull()
  })

  it('wraps plain message in single turn', () => {
    const result = parseTurnsFromAssistantMessage('Hello world')
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].assistant).toBe('Hello world')
    expect(result![0].user).toBe('')
  })

  it('passes through initialImages and initialFiles to single-turn result', () => {
    const imgs = ['data:image/png;base64,abc']
    const result = parseTurnsFromAssistantMessage('reply', undefined, imgs)
    expect(result![0].images).toEqual(imgs)
  })

  it('parses multi-turn format #1 / #2', () => {
    const msg = `#1\n用户：问题一\nAI：回答一\n\n#2\n用户：问题二\nAI：回答二`
    const result = parseTurnsFromAssistantMessage(msg)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(2)
    expect(result![0].user).toBe('问题一')
    expect(result![0].assistant).toBe('回答一')
    expect(result![1].user).toBe('问题二')
    expect(result![1].assistant).toBe('回答二')
  })

  it('attaches initialImages/Files only to first turn in multi-turn', () => {
    const msg = `#1\n用户：q1\nAI：a1\n\n#2\n用户：q2\nAI：a2`
    const imgs = ['img1']
    const result = parseTurnsFromAssistantMessage(msg, undefined, imgs)
    expect(result![0].images).toEqual(imgs)
    expect(result![1].images).toBeUndefined()
  })

  it('falls back to single turn when regex matches nothing', () => {
    const malformed = '#1\nno valid format here'
    const result = parseTurnsFromAssistantMessage(malformed)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].assistant).toBe(malformed)
  })

  it('passes reasoning param through to single-turn result', () => {
    const msg = '这是正文'
    const result = parseTurnsFromAssistantMessage(msg, '这是推理过程')
    expect(result![0].reasoning).toBe('这是推理过程')
    expect(result![0].assistant).toBe('这是正文')
  })

  it('extracts reasoning from THINKING sentinel in multi-turn format', () => {
    const aiContent = '思考：这是思考内容\n\n[/THINKING]\n\n这是正文'
    const msg = `#1\n用户：问题\nAI：${aiContent}`
    const result = parseTurnsFromAssistantMessage(msg)
    expect(result).not.toBeNull()
    expect(result![0].reasoning).toBe('这是思考内容')
    expect(result![0].assistant).toBe('这是正文')
  })
})

// ── stripLeadingNumberHeading ──────────────────────────────────────────────

describe('stripLeadingNumberHeading', () => {
  it('returns empty string unchanged', () => {
    expect(stripLeadingNumberHeading('')).toBe('')
  })

  it('strips THINKING sentinel block', () => {
    const text = '思考：内部推理\n\n[/THINKING]\n\n正文内容'
    expect(stripLeadingNumberHeading(text)).toBe('正文内容')
  })

  it('strips leading #N heading', () => {
    const text = '#1\n正文内容'
    expect(stripLeadingNumberHeading(text)).toBe('正文内容')
  })

  it('strips multi-turn prefix (用户/AI format)', () => {
    const text = '#1\n用户：问题\nAI：\n正文回答'
    const result = stripLeadingNumberHeading(text)
    expect(result).toBe('正文回答')
  })

  it('leaves plain text untouched', () => {
    expect(stripLeadingNumberHeading('普通回答内容')).toBe('普通回答内容')
  })

  it('handles streaming thinking without sentinel', () => {
    const text = '思考：推理中\n\n正式回答'
    const result = stripLeadingNumberHeading(text)
    expect(result).toBe('正式回答')
  })
})

// ── buildAIHistory ─────────────────────────────────────────────────────────

describe('buildAIHistory', () => {
  it('returns empty array for empty turns', () => {
    expect(buildAIHistory([])).toEqual([])
  })

  it('skips turns with empty user messages', () => {
    const turns = [
      { user: '', assistant: 'AI greeting' }
    ]
    expect(buildAIHistory(turns)).toEqual([])
  })

  it('skips turns with whitespace-only user messages', () => {
    const turns = [{ user: '   ', assistant: 'ai' }]
    expect(buildAIHistory(turns)).toEqual([])
  })

  it('includes user and assistant messages in correct order', () => {
    const turns = [
      { user: 'hello', assistant: 'hi there' }
    ]
    const result = buildAIHistory(turns)
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' }
    ])
  })

  it('omits assistant message if empty', () => {
    const turns = [{ user: 'hello', assistant: '' }]
    const result = buildAIHistory(turns)
    expect(result).toEqual([
      { role: 'user', content: 'hello' }
    ])
  })

  it('builds correct history from multiple turns', () => {
    const turns = [
      { user: 'q1', assistant: 'a1' },
      { user: '', assistant: 'greeting' },   // should be skipped
      { user: 'q2', assistant: 'a2' }
    ]
    const result = buildAIHistory(turns)
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' }
    ])
  })
})
