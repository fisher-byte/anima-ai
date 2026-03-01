import { useCallback, useEffect, useRef } from 'react'
import { streamAI, callAI } from '../../../services/ai'
import type { AIMessage } from '../../../shared/types'

interface UseAIOptions {
  onStream?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: string) => void
}

export function useAI(options: UseAIOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const callbacksRef = useRef<UseAIOptions>(options)
  // 保存对话历史，用于连续对话
  const conversationHistoryRef = useRef<AIMessage[]>([])

  useEffect(() => {
    callbacksRef.current = options
  }, [options])

  /**
   * 发送消息并获取流式响应
   * @param userMessage 用户消息
   * @param preferences 偏好设置
   * @param history 可选的历史对话记录（用于连续对话）
   */
  const sendMessage = useCallback(async (
    userMessage: string,
    preferences: string[] = [],
    history?: AIMessage[]
  ) => {
    // 如果有外部传入的历史，使用它；否则使用内部保存的历史
    const messages: AIMessage[] = history ? [...history] : [...conversationHistoryRef.current]
    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage })

    try {
      let fullText = ''
      
      for await (const chunk of streamAI(messages, preferences)) {
        if (typeof chunk === 'string') {
          fullText += chunk
          callbacksRef.current.onStream?.(chunk)
        }
      }

      // 保存到对话历史：用户消息 + AI回复
      conversationHistoryRef.current = [
        ...messages,
        { role: 'assistant', content: fullText }
      ]

      callbacksRef.current.onComplete?.(fullText)
      return fullText
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      callbacksRef.current.onError?.(errorMessage)
      return ''
    }
  }, [])

  /**
   * 重置对话历史（新对话时调用）
   */
  const resetHistory = useCallback(() => {
    conversationHistoryRef.current = []
  }, [])

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
        callbacksRef.current.onError?.(response.error)
        return ''
      }

      callbacksRef.current.onComplete?.(response.content)
      return response.content
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      callbacksRef.current.onError?.(errorMessage)
      return ''
    }
  }, [])

  /**
   * 取消当前请求
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return {
    sendMessage,
    sendMessageSync,
    cancel,
    resetHistory
  }
}
