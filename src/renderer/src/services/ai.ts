/**
 * AI Service - Web version
 *
 * In Web mode, all AI calls are proxied through the backend (/api/ai/stream).
 * The API key never touches the browser.
 *
 * Exports the same interface as the original src/services/ai.ts so that
 * useAI.ts and other consumers work without modification.
 */

import type { AIMessage } from '../../../shared/types'

export interface AIStreamChunk {
  type: 'content' | 'reasoning'
  content: string
}

interface AIResponse {
  content: string
  error?: string
}

/**
 * Streaming AI call via backend SSE proxy.
 * Drop-in replacement for the original streamAI generator.
 */
export async function* streamAI(
  messages: AIMessage[],
  preferences: string[] = [],
  signal?: AbortSignal,
  compressedMemory?: string,
  isOnboarding?: boolean
): AsyncGenerator<AIStreamChunk, AIResponse, unknown> {
  const controller = new AbortController()
  const combinedSignal = signal
    ? (() => {
        signal.addEventListener('abort', () => controller.abort())
        return controller.signal
      })()
    : controller.signal

  let fullContent = ''

  try {
    const res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, preferences, compressedMemory, isOnboarding }),
      signal: combinedSignal
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`AI proxy error ${res.status}: ${text}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()

    while (true) {
      if (signal?.aborted) throw new Error('生成已停止')

      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((l) => l.trim())

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)

        try {
          const evt = JSON.parse(raw) as {
            type: 'content' | 'reasoning' | 'done' | 'error'
            content?: string
            fullText?: string
            message?: string
          }

          if (evt.type === 'content' && evt.content) {
            fullContent += evt.content
            yield { type: 'content', content: evt.content }
          } else if (evt.type === 'reasoning' && evt.content) {
            yield { type: 'reasoning', content: evt.content }
          } else if (evt.type === 'done') {
            // Stream finished
          } else if (evt.type === 'error') {
            throw new Error(evt.message ?? 'Unknown AI error')
          }
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue
          throw parseErr
        }
      }
    }

    return { content: fullContent }
  } catch (error) {
    if (error instanceof Error && error.message === '生成已停止') {
      throw error
    }
    console.error('AI stream failed:', error)
    throw error instanceof Error ? error : new Error('Unknown error')
  }
}

/**
 * Non-streaming AI call via backend proxy (collects the full SSE stream).
 */
export async function callAI(
  messages: AIMessage[],
  preferences: string[] = []
): Promise<AIResponse> {
  let content = ''
  try {
    for await (const chunk of streamAI(messages, preferences)) {
      if (chunk.type === 'content') content += chunk.content
    }
    return { content }
  } catch (error) {
    return { content, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Stub: setApiKey is now handled via configService / backend.
 * Kept for interface compatibility.
 */
export async function setApiKey(_apiKey: string): Promise<boolean> {
  return true
}
