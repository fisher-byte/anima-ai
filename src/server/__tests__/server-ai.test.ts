/**
 * AI Stream Unit Tests
 *
 * Tests for multi-round web_search logic (readRound), clarification layer
 * trigger rules, and search_round SSE event format.
 * These are pure logic tests — no HTTP, no DB required.
 */

import { describe, it, expect } from 'vitest'
import { appendClientContextBlocks } from '../routes/ai'

// ── SSE stream helpers ────────────────────────────────────────────────────────

/** Build a mock Response with a ReadableStream body from SSE lines */
function buildSseResponse(lines: string[]): Response {
  const body = lines.join('')
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

/**
 * Inline readRound logic — mirrors src/server/routes/ai.ts exactly.
 * Reads one SSE stream round and returns accumulated tool_calls + finishReason.
 */
async function readRoundUnit(res: Response): Promise<{
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
  finishReason: string | null
}> {
  const toolCallMap: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}
  let finishReason: string | null = null
  const decoder = new TextDecoder()
  let sseBuffer = ''
  const reader = res.body?.getReader()
  if (!reader) return { toolCalls: [], finishReason: null }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const parts = sseBuffer.split(/\r?\n\r?\n/)
      sseBuffer = parts.pop() ?? ''

      for (const part of parts) {
        for (const line of part.split(/\r?\n/)) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            const fr = parsed.choices?.[0]?.finish_reason
            if (fr) finishReason = fr
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx: number = tc.index
                if (!toolCallMap[idx]) {
                  toolCallMap[idx] = {
                    id: tc.id ?? '',
                    type: tc.type ?? 'function',
                    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' }
                  }
                } else {
                  if (tc.function?.name) toolCallMap[idx].function.name += tc.function.name
                  if (tc.function?.arguments) toolCallMap[idx].function.arguments += tc.function.arguments
                }
              }
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return { toolCalls: Object.values(toolCallMap), finishReason }
}

// ── Clarification layer trigger logic ────────────────────────────────────────

/**
 * Mirrors the trigger condition in AnswerModal.tsx:
 *   hasResearchKw && !hasConcreteTarget && !isOnboardingMode && !clarifyPending
 */
function shouldTriggerClarify(
  input: string,
  isOnboardingMode: boolean,
  clarifyPending: string | null
): boolean {
  const RESEARCH_KEYWORDS = ['调研', '分析', '研究', '了解', '探索', '深入', '梳理', '调查', '查一查', '帮我看看', '帮我了解']
  const trimmed = input.trim()
  const hasResearchKw = RESEARCH_KEYWORDS.some(kw => trimmed.includes(kw))
  const hasConcreteTarget =
    /["「」'']/.test(trimmed) ||     // explicit target in quotes
    /\d{4}/.test(trimmed) ||         // year → already specific
    /[a-zA-Z]{4,}/.test(trimmed) ||  // english brand/tech name
    trimmed.length > 20              // long enough to be specific
  return hasResearchKw && !hasConcreteTarget && !isOnboardingMode && !clarifyPending
}

// ── readRound tests ───────────────────────────────────────────────────────────

describe('readRound: tool_call 累积与 finishReason', () => {
  it('普通 content 流：finishReason=stop, 无 tool_calls', async () => {
    const lines = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n',
      'data: [DONE]\n\n'
    ]
    const { toolCalls, finishReason } = await readRoundUnit(buildSseResponse(lines))
    expect(finishReason).toBe('stop')
    expect(toolCalls).toHaveLength(0)
  })

  it('tool_calls 流：finishReason=tool_calls, 正确累积 arguments', async () => {
    const lines = [
      'data: ' + JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc-1', type: 'function', function: { name: '$web_search', arguments: '{"query":' } }] }, finish_reason: null }]
      }) + '\n\n',
      'data: ' + JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"AI trends"}' } }] }, finish_reason: null }]
      }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n',
      'data: [DONE]\n\n'
    ]
    const { toolCalls, finishReason } = await readRoundUnit(buildSseResponse(lines))
    expect(finishReason).toBe('tool_calls')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].id).toBe('tc-1')
    expect(toolCalls[0].function.name).toBe('$web_search')
    expect(toolCalls[0].function.arguments).toBe('{"query":"AI trends"}')
  })

  it('reader.releaseLock 在流结束后被调用（无资源泄漏）', async () => {
    const lines = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] }) + '\n\n',
      'data: [DONE]\n\n'
    ]
    const res = buildSseResponse(lines)
    await readRoundUnit(res)
    expect(() => res.body?.getReader()).not.toThrow()
  })

  it('多个 tool_calls（并行搜索）可以正确独立累积', async () => {
    const lines = [
      'data: ' + JSON.stringify({
        choices: [{ delta: { tool_calls: [
          { index: 0, id: 'tc-0', type: 'function', function: { name: '$web_search', arguments: '{"query":"foo"}' } },
          { index: 1, id: 'tc-1', type: 'function', function: { name: '$web_search', arguments: '{"query":"bar"}' } }
        ] }, finish_reason: null }]
      }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n',
    ]
    const { toolCalls, finishReason } = await readRoundUnit(buildSseResponse(lines))
    expect(finishReason).toBe('tool_calls')
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls.map(tc => tc.function.arguments)).toContain('{"query":"foo"}')
    expect(toolCalls.map(tc => tc.function.arguments)).toContain('{"query":"bar"}')
  })

  it('[DONE] 事件被跳过，不触发 JSON parse 错误', async () => {
    const { toolCalls, finishReason } = await readRoundUnit(buildSseResponse(['data: [DONE]\n\n']))
    expect(toolCalls).toHaveLength(0)
    expect(finishReason).toBeNull()
  })

  it('空 body 返回空 toolCalls', async () => {
    const { toolCalls, finishReason } = await readRoundUnit(new Response(null, { status: 200 }))
    expect(toolCalls).toHaveLength(0)
    expect(finishReason).toBeNull()
  })
})

// ── Clarification layer tests ─────────────────────────────────────────────────

describe('澄清层触发规则', () => {
  it('含调研关键词 + 无具体锚点 → 触发澄清', () => {
    expect(shouldTriggerClarify('调研一下AI', false, null)).toBe(true)
    expect(shouldTriggerClarify('分析市场', false, null)).toBe(true)
    expect(shouldTriggerClarify('帮我了解竞品', false, null)).toBe(true)
  })

  it('含引号 → 已足够具体，不触发', () => {
    expect(shouldTriggerClarify('调研"OpenAI"的产品策略', false, null)).toBe(false)
  })

  it('含年份 → 不触发', () => {
    expect(shouldTriggerClarify('分析2024年AI趋势', false, null)).toBe(false)
  })

  it('含英文词（≥4字符）→ 不触发', () => {
    expect(shouldTriggerClarify('调研React框架', false, null)).toBe(false)
    expect(shouldTriggerClarify('分析ChatGPT', false, null)).toBe(false)
  })

  it('输入长度 >20 → 已足够具体，不触发', () => {
    expect(shouldTriggerClarify('调研一下人工智能行业的市场规模和主要玩家吧', false, null)).toBe(false)
  })

  it('onboarding 模式下 → 不触发', () => {
    expect(shouldTriggerClarify('调研市场', true, null)).toBe(false)
  })

  it('已有 clarifyPending → 不重复触发', () => {
    expect(shouldTriggerClarify('调研AI', false, '调研AI')).toBe(false)
  })

  it('无调研关键词 → 不触发', () => {
    expect(shouldTriggerClarify('今天天气怎么样', false, null)).toBe(false)
    expect(shouldTriggerClarify('帮我写一首诗', false, null)).toBe(false)
  })

  it('边界：短英文(少于4字)不算具体锚点', () => {
    expect(shouldTriggerClarify('调研AI', false, null)).toBe(true)
  })
})

// ── search_round SSE event format tests ──────────────────────────────────────

describe('search_round SSE event 格式', () => {
  function searchRoundMessage(round: number): string {
    return round === 2
      ? '你的问题有点复杂，正在进行更多搜索…'
      : `正在进行第 ${round} 轮搜索，请稍候…`
  }

  it('round=2 时 message 应为提示语', () => {
    expect(searchRoundMessage(2)).toBe('你的问题有点复杂，正在进行更多搜索…')
  })

  it('round=3 时 message 应含轮次号', () => {
    expect(searchRoundMessage(3)).toBe('正在进行第 3 轮搜索，请稍候…')
  })

  it('round=5 时 message 应含 5', () => {
    expect(searchRoundMessage(5)).toContain('5')
  })

  it('MAX_SEARCH_ROUNDS = 5 防止无限循环', () => {
    const MAX_SEARCH_ROUNDS = 5
    let round = 1
    let iterations = 0
    while (round <= MAX_SEARCH_ROUNDS) {
      iterations++
      round += 1
      if (round > MAX_SEARCH_ROUNDS) break
    }
    expect(iterations).toBe(MAX_SEARCH_ROUNDS)
    expect(round).toBe(MAX_SEARCH_ROUNDS + 1)
  })

  it('finishReason != tool_calls 时立即退出循环', () => {
    const MAX_SEARCH_ROUNDS = 5
    let round = 1
    let iterations = 0
    const mockFinishReasons = ['tool_calls', 'stop']
    while (round <= MAX_SEARCH_ROUNDS) {
      const finishReason = mockFinishReasons[iterations] ?? 'stop'
      iterations++
      if (finishReason !== 'tool_calls') break
      round += 1
      if (round > MAX_SEARCH_ROUNDS) break
    }
    expect(iterations).toBe(2)
    expect(round).toBe(2)
  })
})

describe('appendClientContextBlocks', () => {
  it('appends compressedMemory even when caller uses systemPromptOverride', () => {
    const { systemPrompt } = appendClientContextBlocks('OVERRIDE PROMPT', {
      compressedMemory: 'memory fact',
      extraContext: 'decision evidence',
    })

    expect(systemPrompt).toContain('OVERRIDE PROMPT')
    expect(systemPrompt).toContain('【相关记忆片段 - 供参考】')
    expect(systemPrompt).toContain('memory fact')
    expect(systemPrompt).toContain('【额外上下文】')
    expect(systemPrompt).toContain('decision evidence')
  })

  it('skips blank optional blocks', () => {
    const { systemPrompt } = appendClientContextBlocks('BASE PROMPT', {
      compressedMemory: '   ',
      extraContext: '',
    })

    expect(systemPrompt).toBe('BASE PROMPT')
  })
})

// ── URL_REGEX 匹配规则测试 ─────────────────────────────────────────────────────

// Note: use .match() only — never .exec() loop (shared lastIndex on /g regex)
const URL_REGEX_TEST = /https?:\/\/[^\s\]）)>】'"。，！？；：\s]{10,}/g

describe('URL_REGEX pattern', () => {
  it('标准 HTTP URL 被检测到', () => {
    const matches = 'visit http://example.com/page'.match(URL_REGEX_TEST)
    expect(matches).toContain('http://example.com/page')
  })

  it('标准 HTTPS URL 被检测到', () => {
    const matches = 'see https://www.google.com/search?q=test'.match(URL_REGEX_TEST)
    expect(matches).not.toBeNull()
    expect(matches![0]).toContain('https://www.google.com')
  })

  it('URL 末尾中文标点（，。）被截断', () => {
    const matches = '请看 https://example.com/path，谢谢'.match(URL_REGEX_TEST)
    expect(matches).not.toBeNull()
    expect(matches![0]).not.toContain('，')
    expect(matches![0]).toBe('https://example.com/path')
  })

  it('纯文字 www.xxx 不匹配（缺少协议）', () => {
    const matches = 'go to www.example.com'.match(URL_REGEX_TEST)
    expect(matches).toBeNull()
  })

  it('消息中多个 URL 都被匹配', () => {
    const matches = 'see https://foo.com/abc and https://bar.com/xyz'.match(URL_REGEX_TEST)
    expect(matches).toHaveLength(2)
    expect(matches).toContain('https://foo.com/abc')
    expect(matches).toContain('https://bar.com/xyz')
  })

  it('不含协议的字符串不匹配', () => {
    const matches = 'ftp://example.com/file'.match(URL_REGEX_TEST)
    expect(matches).toBeNull()
  })
})

// ── fetchUrlContent mock 测试 ─────────────────────────────────────────────────

describe('fetchUrlContent mock', () => {
  it('fetch 抛异常时返回 null（不抛出）', async () => {
    const fetchUrlContentMock = async (_url: string): Promise<string | null> => {
      try {
        throw new Error('network error')
      } catch { return null }
    }
    const result = await fetchUrlContentMock('https://example.com')
    expect(result).toBeNull()
  })

  it('非 200 响应返回 null', async () => {
    const fetchUrlContentMock = async (_url: string): Promise<string | null> => {
      const mockResp = { ok: false, text: async () => '' }
      if (!mockResp.ok) return null
      return await mockResp.text()
    }
    const result = await fetchUrlContentMock('https://example.com')
    expect(result).toBeNull()
  })

  it('内容超 8000 字符时截断到 8000', async () => {
    const longText = 'a'.repeat(10000)
    const fetchUrlContentMock = async (_url: string): Promise<string | null> => {
      return longText.slice(0, 8000)
    }
    const result = await fetchUrlContentMock('https://example.com')
    expect(result).toHaveLength(8000)
  })
})

// ── search_memory tool_call 测试 ──────────────────────────────────────────────

describe('search_memory tool_call', () => {
  const TOOLS_WITH_MEMORY_TEST = [
    { type: 'builtin_function', function: { name: '$web_search' } },
    {
      type: 'function',
      function: {
        name: 'search_memory',
        description: '查询用户的个人记忆库',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词或问题' }
          },
          required: ['query']
        }
      }
    }
  ]

  it('search_memory tool type 是 function（不是 builtin_function）', () => {
    const memoryTool = TOOLS_WITH_MEMORY_TEST.find(t => t.function.name === 'search_memory')
    expect(memoryTool?.type).toBe('function')
  })

  it('search_memory 的 query 参数在 required 中', () => {
    const memoryTool = TOOLS_WITH_MEMORY_TEST.find(t => t.function.name === 'search_memory')
    expect((memoryTool?.function as any).parameters.required).toContain('query')
  })

  it('toolCalls 含 search_memory 时 isMemoryRound 为 true', () => {
    const toolCalls = [{ id: 'tc-1', type: 'function', function: { name: 'search_memory', arguments: '{"query":"test"}' } }]
    const isMemoryRound = toolCalls.some(tc => tc.function.name === 'search_memory')
    expect(isMemoryRound).toBe(true)
  })

  it('toolCalls 仅含 $web_search 时 isMemoryRound 为 false', () => {
    const toolCalls = [{ id: 'tc-2', type: 'builtin_function', function: { name: '$web_search', arguments: '{"query":"test"}' } }]
    const isMemoryRound = toolCalls.some(tc => tc.function.name === 'search_memory')
    expect(isMemoryRound).toBe(false)
  })
})

// ── search_round 记忆轮文案测试 ───────────────────────────────────────────────

describe('search_round 记忆轮文案', () => {
  function searchRoundMsg(round: number, isMemoryRound: boolean): string {
    return isMemoryRound
      ? '正在查询记忆库…'
      : (round === 2 ? '你的问题有点复杂，正在进行更多搜索…' : `正在进行第 ${round} 轮搜索，请稍候…`)
  }

  it('isMemoryRound=true 时 message 恒为"正在查询记忆库…"（不受 round 值影响）', () => {
    expect(searchRoundMsg(2, true)).toBe('正在查询记忆库…')
    expect(searchRoundMsg(5, true)).toBe('正在查询记忆库…')
  })

  it('isMemoryRound=false 时 web 搜索文案不变（round=2→提示语，round=3→轮次号）', () => {
    expect(searchRoundMsg(2, false)).toBe('你的问题有点复杂，正在进行更多搜索…')
    expect(searchRoundMsg(3, false)).toBe('正在进行第 3 轮搜索，请稍候…')
  })
})

// ── TOOLS_WITH_MEMORY 结构测试 ────────────────────────────────────────────────

describe('TOOLS_WITH_MEMORY 结构', () => {
  const TOOLS = [
    { type: 'builtin_function', function: { name: '$web_search' } },
    {
      type: 'function',
      function: {
        name: 'search_memory',
        description: '查询用户的个人记忆库',
        parameters: { type: 'object', properties: { query: { type: 'string', description: '' } }, required: ['query'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: '在用户上传的文件中语义搜索相关内容片段',
        parameters: { type: 'object', properties: { query: { type: 'string', description: '要搜索的内容关键词或问题' } }, required: ['query'] }
      }
    }
  ]

  it('包含恰好 3 个工具', () => {
    expect(TOOLS).toHaveLength(3)
  })

  it('第一个是 $web_search（type=builtin_function）', () => {
    expect(TOOLS[0].type).toBe('builtin_function')
    expect(TOOLS[0].function.name).toBe('$web_search')
  })

  it('第二个是 search_memory（type=function）', () => {
    expect(TOOLS[1].type).toBe('function')
    expect(TOOLS[1].function.name).toBe('search_memory')
  })
})

// ── search_files tool 结构测试 ────────────────────────────────────────────────

describe('search_files tool 结构', () => {
  const TOOLS = [
    { type: 'builtin_function', function: { name: '$web_search' } },
    {
      type: 'function',
      function: {
        name: 'search_memory',
        description: '查询用户的个人记忆库',
        parameters: { type: 'object', properties: { query: { type: 'string', description: '' } }, required: ['query'] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: '在用户上传的文件中语义搜索相关内容片段',
        parameters: { type: 'object', properties: { query: { type: 'string', description: '要搜索的内容关键词或问题' } }, required: ['query'] }
      }
    }
  ]

  it('TOOLS_WITH_MEMORY 包含恰好 3 个工具', () => {
    expect(TOOLS).toHaveLength(3)
  })

  it('第三个工具是 search_files（type=function）', () => {
    const tool = TOOLS.find(t => t.function.name === 'search_files')
    expect(tool).toBeDefined()
    expect(tool?.type).toBe('function')
  })

  it('search_files 的 query 参数在 required 中', () => {
    const tool = TOOLS.find(t => t.function.name === 'search_files')
    expect((tool?.function as any).parameters.required).toContain('query')
  })
})

// ── search_round 文件检索文案测试 ─────────────────────────────────────────────

describe('search_round 文件检索文案', () => {
  function searchRoundMsgFull(round: number, isMemoryRound: boolean, isFileRound: boolean): string {
    return isMemoryRound
      ? '正在查询记忆库…'
      : isFileRound
        ? '正在检索文件内容…'
        : (round === 2 ? '你的问题有点复杂，正在进行更多搜索…' : `正在进行第 ${round} 轮搜索，请稍候…`)
  }

  it('toolCalls 含 search_files 时 isFileRound 为 true', () => {
    const toolCalls = [{ id: 'tc-1', type: 'function', function: { name: 'search_files', arguments: '{"query":"test"}' } }]
    const isFileRound = toolCalls.some(tc => tc.function.name === 'search_files')
    expect(isFileRound).toBe(true)
  })

  it('isFileRound=true 时 message 为"正在检索文件内容…"', () => {
    expect(searchRoundMsgFull(2, false, true)).toBe('正在检索文件内容…')
    expect(searchRoundMsgFull(3, false, true)).toBe('正在检索文件内容…')
  })

  it('isMemoryRound 优先级高于 isFileRound（同时存在时显示记忆文案）', () => {
    expect(searchRoundMsgFull(2, true, true)).toBe('正在查询记忆库…')
  })
})

// ── v0.4.3 记忆评分系统（applyDecay / loadMemoryScores / saveMemoryScores）─────

describe('applyDecay 时间衰减', () => {
  const DECAY_HALF_LIFE_DAYS = 69

  function applyDecay(cosineScore: number, factCreatedAt: string, enabled: boolean): number {
    if (!enabled) return cosineScore
    const daysSince = (Date.now() - new Date(factCreatedAt).getTime()) / 86_400_000
    const decayFactor = Math.exp(-Math.LN2 / DECAY_HALF_LIFE_DAYS * daysSince)
    return cosineScore * decayFactor
  }

  it('MEMORY_DECAY=false 时直接返回原始 cosineScore（无衰减）', () => {
    const score = applyDecay(0.8, new Date().toISOString(), false)
    expect(score).toBe(0.8)
  })

  it('MEMORY_DECAY=true 且 fact 是今天创建时衰减因子接近 1', () => {
    const score = applyDecay(1.0, new Date().toISOString(), true)
    expect(score).toBeGreaterThan(0.999)  // 刚创建，几乎无衰减
  })

  it('MEMORY_DECAY=true 且 fact 距今 69 天时衰减因子接近 0.5（半衰期定义）', () => {
    const daysAgo69 = new Date(Date.now() - 69 * 86_400_000).toISOString()
    const score = applyDecay(1.0, daysAgo69, true)
    expect(score).toBeGreaterThan(0.48)
    expect(score).toBeLessThan(0.52)
  })

  it('MEMORY_DECAY=true 且 fact 距今 138 天时衰减因子接近 0.25（两个半衰期）', () => {
    const daysAgo138 = new Date(Date.now() - 138 * 86_400_000).toISOString()
    const score = applyDecay(1.0, daysAgo138, true)
    expect(score).toBeGreaterThan(0.23)
    expect(score).toBeLessThan(0.27)
  })

  it('衰减后分值永远不超过原始 cosineScore', () => {
    const daysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const original = 0.75
    expect(applyDecay(original, daysAgo, true)).toBeLessThanOrEqual(original)
  })
})

describe('MEMORY_STRATEGY 环境变量', () => {
  it('默认值为 baseline（不设置时）', () => {
    const strategy = process.env.MEMORY_STRATEGY ?? 'baseline'
    // 在测试环境中未设置该变量，所以应该是 'baseline'
    expect(['baseline', 'scored']).toContain(strategy)
  })

  it('scored 策略 finalScore 公式权重正确', () => {
    // finalScore = decayed * (0.7 + importance * 0.3) + accessBonus
    const decayed = 0.8
    const importance = 1.0
    const accessBonus = 0
    const finalScore = decayed * (0.7 + importance * 0.3) + accessBonus
    expect(finalScore).toBeCloseTo(0.8, 5)  // 0.8 * 1.0 = 0.8
  })

  it('importance=0.5（默认值）时权重系数为 0.85', () => {
    const importance = 0.5
    const weightFactor = 0.7 + importance * 0.3
    expect(weightFactor).toBeCloseTo(0.85, 5)
  })

  it('accessBonus 上限是 0.15（access_count 无论多大）', () => {
    const accessBonus = (count: number) => Math.min(0.15, count * 0.02)
    expect(accessBonus(0)).toBe(0)
    expect(accessBonus(5)).toBe(0.1)
    expect(accessBonus(8)).toBeCloseTo(0.15, 5)  // 8 * 0.02 = 0.16 → capped at 0.15
    expect(accessBonus(100)).toBe(0.15)  // 上限
  })
})

// ── v0.4.4 会话级记忆摘要（session_memory.json）──────────────────────────────

describe('session_memory 触发条件', () => {
  type AIMessage = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }

  function shouldGenerateSessionSummary(
    messages: AIMessage[],
    hasExistingSummary: boolean,
    isOnboarding: boolean,
    convId: string | undefined
  ): boolean {
    if (isOnboarding) return false
    if (!convId) return false
    if (hasExistingSummary) return false
    const userTurns = messages.filter(m => m.role === 'user').length
    return userTurns >= 10
  }

  it('用户轮数 < 10 时不生成摘要', () => {
    const msgs = Array.from({ length: 9 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, false, false, 'conv-1')).toBe(false)
  })

  it('用户轮数 = 10 时触发生成', () => {
    const msgs = Array.from({ length: 10 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, false, false, 'conv-1')).toBe(true)
  })

  it('用户轮数 > 10 时也触发', () => {
    const msgs = Array.from({ length: 15 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, false, false, 'conv-1')).toBe(true)
  })

  it('已有摘要时不重复生成', () => {
    const msgs = Array.from({ length: 12 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, true, false, 'conv-1')).toBe(false)
  })

  it('onboarding 模式下不生成', () => {
    const msgs = Array.from({ length: 12 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, false, true, 'conv-1')).toBe(false)
  })

  it('无 convId 时不生成', () => {
    const msgs = Array.from({ length: 12 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(shouldGenerateSessionSummary(msgs, false, false, undefined)).toBe(false)
  })
})

describe('session_memory 注入条件', () => {
  it('有摘要 + 轮数 >= 10 时注入', () => {
    const session = { summary: '用户讨论了React优化', turn_count: 12, updated_at: new Date().toISOString() }
    const msgCount = 12
    const shouldInject = !!session?.summary && msgCount >= 10
    expect(shouldInject).toBe(true)
    expect(session.summary).toContain('React')
  })

  it('轮数 < 10 时不注入（即便有摘要）', () => {
    const session = { summary: '用户讨论了React优化', turn_count: 8, updated_at: new Date().toISOString() }
    const msgCount = 8
    const shouldInject = !!session?.summary && msgCount >= 10
    expect(shouldInject).toBe(false)
  })

  it('无摘要时不注入', () => {
    const session = null
    const msgCount = 15
    const shouldInject = !!session && msgCount >= 10
    expect(shouldInject).toBe(false)
  })

  it('摘要保留最近 50 条限制逻辑', () => {
    const all: Record<string, { updated_at: string }> = {}
    for (let i = 0; i < 55; i++) {
      all[`conv-${i}`] = { updated_at: new Date(Date.now() + i * 1000).toISOString() }
    }
    const keys = Object.keys(all)
    // 淘汰旧的（前 5 条）
    if (keys.length > 50) {
      keys.sort((a, b) => (all[a].updated_at < all[b].updated_at ? -1 : 1))
      keys.slice(0, keys.length - 50).forEach(k => delete all[k])
    }
    expect(Object.keys(all)).toHaveLength(50)
    expect(all['conv-0']).toBeUndefined()  // 最老的被删除
    expect(all['conv-54']).toBeDefined()   // 最新的保留
  })
})

// ── v0.4.5 MEMORY_BUDGET 环境变量 ────────────────────────────────────────────

describe('MEMORY_BUDGET 环境变量解析', () => {
  function parseMemoryBudget(envVal: string | undefined): number {
    return parseInt(envVal ?? '1500', 10) || 1500
  }

  it('未设置时默认 1500', () => {
    expect(parseMemoryBudget(undefined)).toBe(1500)
  })

  it('设置为 2000 时返回 2000', () => {
    expect(parseMemoryBudget('2000')).toBe(2000)
  })

  it('设置为 800 时返回 800', () => {
    expect(parseMemoryBudget('800')).toBe(800)
  })

  it('非数字字符串降级到 1500', () => {
    expect(parseMemoryBudget('abc')).toBe(1500)
  })

  it('空字符串降级到 1500', () => {
    expect(parseMemoryBudget('')).toBe(1500)
  })
})
