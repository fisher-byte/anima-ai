/**
 * Unit tests for ai.ts (Web version)
 *
 * Covers:
 *  - Network error normalization（fetch failed / Failed to fetch / BodyStreamBuffer）
 *  - HTTP error status → friendly message mapping
 *  - SSE stream parsing
 *  - 生成已停止 passthrough
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock storageService to avoid import side-effects
vi.mock('../storageService', () => ({
  getAuthToken: () => null
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper: build a ReadableStream from SSE lines
function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    }
  })
}

function mockSseResponse(lines: string[]): Response {
  return new Response(sseStream(lines), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  })
}

// ── streamAI ──────────────────────────────────────────────────────────────────

describe('streamAI — network error normalization', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('normalizes lowercase "fetch failed" to friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('网络连接中断，请检查网络后重试')
  })

  it('normalizes "Failed to fetch" (capitalized) to friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('网络连接中断，请检查网络后重试')
  })

  it('normalizes "BodyStreamBuffer was aborted" to friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('BodyStreamBuffer was aborted'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('网络连接中断，请检查网络后重试')
  })

  it('normalizes "NetworkError" to friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('NetworkError when attempting to fetch resource'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('网络连接中断，请检查网络后重试')
  })

  it('normalizes ERR_NETWORK error to friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net::ERR_NETWORK_CHANGED'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('网络连接中断，请检查网络后重试')
  })

  it('passes through "生成已停止" without wrapping', async () => {
    // Simulate: fetch succeeds but signal aborts mid-stream → throws '生成已停止'
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"content","content":"hello"}\n\n'))
        // Don't close — simulate hanging stream, abort will throw
        controller.error(new Error('生成已停止'))
      }
    })
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200 }))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('生成已停止')
  })

  it('does NOT wrap non-network errors with friendly message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('some unexpected internal error'))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('some unexpected internal error')
  })
})

describe('streamAI — HTTP error status mapping', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('throws friendly message for 401', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 401 }))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('API Key 无效或已过期')
  })

  it('throws friendly message for 500', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('AI 服务暂时不可用')
  })

  it('throws generic message for unknown status codes', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 429 }))
    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('请求失败（429）')
  })
})

describe('streamAI — SSE content streaming', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('yields content chunks from SSE stream', async () => {
    mockFetch.mockResolvedValueOnce(mockSseResponse([
      'data: {"type":"content","content":"Hello"}\n\n',
      'data: {"type":"content","content":" World"}\n\n',
      'data: {"type":"done","fullText":"Hello World"}\n\n',
    ]))

    const { streamAI } = await import('../ai')
    const chunks: string[] = []
    for await (const chunk of streamAI([])) {
      if (chunk.type === 'content') chunks.push(chunk.content)
    }
    expect(chunks).toEqual(['Hello', ' World'])
  })

  it('yields reasoning chunks separately', async () => {
    mockFetch.mockResolvedValueOnce(mockSseResponse([
      'data: {"type":"reasoning","content":"thinking..."}\n\n',
      'data: {"type":"content","content":"answer"}\n\n',
      'data: {"type":"done","fullText":"answer"}\n\n',
    ]))

    const { streamAI } = await import('../ai')
    const reasoning: string[] = []
    const content: string[] = []
    for await (const chunk of streamAI([])) {
      if (chunk.type === 'reasoning') reasoning.push(chunk.content)
      if (chunk.type === 'content') content.push(chunk.content)
    }
    expect(reasoning).toEqual(['thinking...'])
    expect(content).toEqual(['answer'])
  })

  it('throws when SSE stream sends error event', async () => {
    mockFetch.mockResolvedValueOnce(mockSseResponse([
      'data: {"type":"error","message":"upstream error"}\n\n',
    ]))

    const { streamAI } = await import('../ai')
    await expect(async () => {
      for await (const _ of streamAI([])) { /* consume */ }
    }).rejects.toThrow('upstream error')
  })

  it('ignores malformed JSON lines without throwing', async () => {
    mockFetch.mockResolvedValueOnce(mockSseResponse([
      'data: not-valid-json\n\n',
      'data: {"type":"content","content":"ok"}\n\n',
      'data: {"type":"done","fullText":"ok"}\n\n',
    ]))

    const { streamAI } = await import('../ai')
    const chunks: string[] = []
    for await (const chunk of streamAI([])) {
      if (chunk.type === 'content') chunks.push(chunk.content)
    }
    expect(chunks).toEqual(['ok'])
  })
})

// ── callAI ─────────────────────────────────────────────────────────────────────

describe('callAI', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('collects full content from stream', async () => {
    mockFetch.mockResolvedValueOnce(mockSseResponse([
      'data: {"type":"content","content":"Hello"}\n\n',
      'data: {"type":"content","content":" World"}\n\n',
      'data: {"type":"done","fullText":"Hello World"}\n\n',
    ]))

    const { callAI } = await import('../ai')
    const result = await callAI([])
    expect(result.content).toBe('Hello World')
    expect(result.error).toBeUndefined()
  })

  it('returns error string on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

    const { callAI } = await import('../ai')
    const result = await callAI([])
    expect(result.error).toBe('网络连接中断，请检查网络后重试')
  })
})
