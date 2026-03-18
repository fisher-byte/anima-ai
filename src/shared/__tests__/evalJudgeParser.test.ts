import { describe, expect, it } from 'vitest'
import { extractJsonObject, parseJudgeJson } from '../evalJudgeParser'

describe('evalJudgeParser', () => {
  it('parses plain JSON payloads', () => {
    expect(parseJudgeJson<{ winner: string }>('{"winner":"decision"}')).toEqual({ winner: 'decision' })
  })

  it('parses fenced JSON payloads', () => {
    expect(parseJudgeJson<{ winner: string }>('```json\n{"winner":"normal"}\n```')).toEqual({ winner: 'normal' })
  })

  it('extracts JSON from prose-wrapped evaluator output', () => {
    const raw = '我需要看到具体的 Normal 与 Decision 比较后，给出以下 JSON：\n{"winner":"tie"}'
    expect(extractJsonObject(raw)).toBe('{"winner":"tie"}')
    expect(parseJudgeJson<{ winner: string }>(raw)).toEqual({ winner: 'tie' })
  })

  it('throws when no JSON object exists', () => {
    expect(() => parseJudgeJson('not json at all')).toThrow('No JSON object found')
  })
})
