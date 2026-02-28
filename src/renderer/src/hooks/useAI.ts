import { useCallback, useRef } from 'react'
import { streamAI, callAI } from '../../../services/ai'
import type { AIMessage } from '../../../shared/types'

interface UseAIOptions {
  onStream?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: string) => void
}

export function useAI(options: UseAIOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * 发送消息并获取流式响应
   */
  const sendMessage = useCallback(async (
    userMessage: string,
    preferences: string[] = []
  ) => {
    const messages: AIMessage[] = [
      { role: 'user', content: userMessage }
    ]

    try {
      let fullText = ''
      
      for await (const chunk of streamAI(messages, preferences)) {
        if (typeof chunk === 'string') {
          fullText += chunk
          options.onStream?.(chunk)
        }
      }

      options.onComplete?.(fullText)
      return fullText
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      options.onError?.(errorMessage)
      return ''
    }
  }, [options])

  /**
   * 发送消息并获取完整响应（非流式）
   */
  const sendMessageSync = useCallback(async (
    userMessage: string,
    preferences: string[] = []
  ) => {
    const messages: AIMessage[] = [
      { role: 'user', content: userMessage }
    ]

    try {
      const response = await callAI(messages, preferences)
      
      if (response.error) {
        options.onError?.(response.error)
        return ''
      }

      options.onComplete?.(response.content)
      return response.content
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      options.onError?.(errorMessage)
      return ''
    }
  }, [options])

  /**
   * 取消当前请求
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return {
    sendMessage,
    sendMessageSync,
    cancel
  }
}
