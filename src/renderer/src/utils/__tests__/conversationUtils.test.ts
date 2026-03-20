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
  buildAIHistory,
  stripFileBlocksOnly,
  stripFileBlocksFromMessage,
  FILE_BLOCK_PREFIX,
  splitThinkingBlockFromAssistant,
  stripOrphanThinkingTags,
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

// ── helpers for time-tagged memories ────────────────────────────────────────

function makeConvWithDate(user: string, assistant: string, createdAt: string, id = 'c1'): Conversation {
  return {
    id,
    createdAt,
    userMessage: user,
    assistantMessage: assistant
  }
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString()
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

  // ── relativeTime integration (via compressMemoriesForPrompt) ───────────────

  it('prefixes memory from today with [今天]', () => {
    const conv = makeConvWithDate('today question', 'answer', daysAgoISO(0))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[今天\]/)
  })

  it('prefixes memory from yesterday with [昨天]', () => {
    const conv = makeConvWithDate('q', 'a', daysAgoISO(1))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[昨天\]/)
  })

  it('prefixes memory from 3 days ago with [3天前]', () => {
    const conv = makeConvWithDate('q', 'a', daysAgoISO(3))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[3天前\]/)
  })

  it('prefixes memory from 7 days ago with [1周前]', () => {
    const conv = makeConvWithDate('q', 'a', daysAgoISO(7))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[1周前\]/)
  })

  it('prefixes memory from 30 days ago with [1个月前]', () => {
    const conv = makeConvWithDate('q', 'a', daysAgoISO(30))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[1个月前\]/)
  })

  it('prefixes memory from 365 days ago with [1年前]', () => {
    const conv = makeConvWithDate('q', 'a', daysAgoISO(365))
    const result = compressMemoriesForPrompt([{ conv }])
    expect(result).toMatch(/^\[1年前\]/)
  })

  it('omits time prefix when createdAt is missing', () => {
    // makeConv uses fixed createdAt '2026-01-01T00:00:00.000Z', which is far in the past
    // but we explicitly test a conv without createdAt
    const conv = { id: 'c1', userMessage: 'q', assistantMessage: 'a' } as Conversation
    const result = compressMemoriesForPrompt([{ conv }])
    // no [xxx] prefix at all
    expect(result).not.toMatch(/^\[/)
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

  it('parses single-turn thinking with single newline before [/THINKING]', () => {
    const msg = '思考：短\n[/THINKING]\n下文'
    const result = parseTurnsFromAssistantMessage(msg)
    expect(result![0].reasoning).toBe('短')
    expect(result![0].assistant).toBe('下文')
  })

  it('parses spaced [/THINKING] tag and strips orphan tags from body', () => {
    const msg = '思考：内\n[ / THINKING ]\n正文'
    const result = parseTurnsFromAssistantMessage(msg)
    expect(result![0].reasoning).toBe('内')
    expect(result![0].assistant).toBe('正文')
  })
})

describe('splitThinkingBlockFromAssistant / stripOrphanThinkingTags', () => {
  it('splits loose sentinel', () => {
    const { reasoning, body } = splitThinkingBlockFromAssistant('思考：a\n[/THINKING]\nb')
    expect(reasoning).toBe('a')
    expect(body).toBe('b')
  })

  it('stripOrphanThinkingTags removes bare markers', () => {
    expect(stripOrphanThinkingTags('前[/THINKING]后')).toBe('前后')
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

  it('strips sentinel with single newline after [/THINKING]', () => {
    const text = '思考：x\n[/THINKING]\n正文'
    expect(stripLeadingNumberHeading(text)).toBe('正文')
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

// ── stripFileBlocksOnly ────────────────────────────────────────────────────

describe('stripFileBlocksOnly', () => {
  const FILE_PREFIX = FILE_BLOCK_PREFIX  // '\n\n以下是我上传的文件内容，请分析并回答我的问题：\n'

  it('returns plain message unchanged when no file block present', () => {
    expect(stripFileBlocksOnly('请帮我写一首诗')).toBe('请帮我写一首诗')
  })

  it('strips everything after FILE_BLOCK_PREFIX', () => {
    const msg = '帮我分析这个文件' + FILE_PREFIX + '=== 文件 1: a.txt ===\n内容\n=== 结束 a.txt ===\n'
    expect(stripFileBlocksOnly(msg)).toBe('帮我分析这个文件')
  })

  it('handles message with ONLY file block (no user text)', () => {
    const msg = FILE_PREFIX + '=== 文件 1: data.csv ===\ndata\n=== 结束 data.csv ===\n'
    // 只有文件块时，截断后得到空串，trim() 返回空
    expect(stripFileBlocksOnly(msg)).toBe('')
  })

  it('preserves [REFERENCE_START]...[REFERENCE_END] blocks (not stripped by this function)', () => {
    const msg = '问题[REFERENCE_START]\n引用内容\n[REFERENCE_END]' + FILE_PREFIX + '文件内容'
    const result = stripFileBlocksOnly(msg)
    expect(result).toContain('[REFERENCE_START]')
    expect(result).not.toContain('文件内容')
  })

  it('is not confused by === 结束 === pattern inside file content', () => {
    // 关键：文件内容包含和结束标记相似的字符串，不应影响前缀截断
    const contentWithFakeEnd = '内容 === 结束 report === 更多内容'
    const msg = '问题' + FILE_PREFIX + `=== 文件 1: report.txt ===\n${contentWithFakeEnd}\n=== 结束 report.txt ===\n`
    expect(stripFileBlocksOnly(msg)).toBe('问题')
  })

  it('handles duplicate filenames correctly', () => {
    const msg = '问题' + FILE_PREFIX +
      '=== 文件 1: data.txt ===\ncontent1\n=== 结束 data.txt ===\n' +
      '=== 文件 2: data.txt ===\ncontent2\n=== 结束 data.txt ===\n'
    expect(stripFileBlocksOnly(msg)).toBe('问题')
  })

  it('preserves empty string input', () => {
    expect(stripFileBlocksOnly('')).toBe('')
  })
})

// ── stripFileBlocksFromMessage ─────────────────────────────────────────────

describe('stripFileBlocksFromMessage', () => {
  it('strips file blocks AND reference blocks', () => {
    const msg = '用户问题[REFERENCE_START]\n引用\n[REFERENCE_END]' + FILE_BLOCK_PREFIX + '文件内容'
    const result = stripFileBlocksFromMessage(msg)
    expect(result).toBe('用户问题')
    expect(result).not.toContain('[REFERENCE_START]')
    expect(result).not.toContain('文件内容')
  })

  it('only strips reference blocks when no file block', () => {
    const msg = '问题[REFERENCE_START]\n大段引用\n[REFERENCE_END]后续文字'
    const result = stripFileBlocksFromMessage(msg)
    expect(result).toBe('问题后续文字')
  })

  it('returns original trimmed text when nothing to strip', () => {
    expect(stripFileBlocksFromMessage('  普通消息  ')).toBe('普通消息')
  })

  it('returns empty string when only file markers remain', () => {
    const msg = FILE_BLOCK_PREFIX + '文件内容'
    expect(stripFileBlocksFromMessage(msg)).toBe('')
  })
})
