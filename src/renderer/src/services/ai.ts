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
import { getAuthToken } from './storageService'

export interface AIStreamChunk {
  type: 'content' | 'reasoning' | 'search_round'
  content: string
  round?: number
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
    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, preferences, compressedMemory, isOnboarding }),
      signal: combinedSignal
    })

    if (!res.ok) {
      const friendlyMessages: Record<number, string> = {
        401: 'API Key 无效或已过期，请在设置中重新配置',
        413: '文件内容过大，请精简后重试',
        415: '不支持该文件类型，请转换格式后重试',
        500: 'AI 服务暂时不可用，请稍后重试',
        502: '后端网关异常，请稍后重试',
        503: 'AI 服务过载，请稍后重试',
      }
      const message = friendlyMessages[res.status] ?? `请求失败（${res.status}）`
      throw new Error(message)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    // SSE buffer：累积跨 TCP chunk 的不完整行，按 \n\n 边界分割完整事件
    let sseBuffer = ''

    while (true) {
      if (signal?.aborted) throw new Error('生成已停止')

      const { done, value } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      // SSE 事件以 \n\n 分隔；split 后最后一段留在 buffer 等待后续 chunk 补全
      const parts = sseBuffer.split('\n\n')
      sseBuffer = parts.pop() ?? ''

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)

          try {
            const evt = JSON.parse(raw) as {
              type: 'content' | 'reasoning' | 'done' | 'error' | 'search_round'
              content?: string
              fullText?: string
              message?: string
              round?: number
            }

            if (evt.type === 'content' && evt.content) {
              fullContent += evt.content
              yield { type: 'content', content: evt.content }
            } else if (evt.type === 'reasoning' && evt.content) {
              yield { type: 'reasoning', content: evt.content }
            } else if (evt.type === 'search_round') {
              yield { type: 'search_round', content: evt.message ?? '', round: evt.round }
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
    }

    return { content: fullContent }
  } catch (error) {
    if (error instanceof Error && error.message === '生成已停止') {
      throw error
    }
    console.error('AI stream failed:', error)
    if (error instanceof Error && (
      error.message.includes('BodyStreamBuffer') ||
      error.message.toLowerCase().includes('fetch failed') ||
      error.message.toLowerCase().includes('failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('ERR_NETWORK')
    )) {
      throw new Error('网络连接中断，请检查网络后重试')
    }
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
