import { useCallback, useEffect, useRef } from 'react'
import { streamAI, callAI } from '../services/ai'
import type { AIMessage } from '../../../shared/types'
import { useCanvasStore } from '../stores/canvasStore'
import { historyService } from '../services/storageService'

interface UseAIOptions {
  onStream?: (chunk: string) => void
  onThinking?: (chunk: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: string) => void
  onStopped?: () => void
}

export function useAI(options: UseAIOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const callbacksRef = useRef<UseAIOptions>(options)
  // 对话历史由 store 维护，这里通过 ref 做内存引用以适应 stream 逻辑
  const { conversationHistory, setConversationHistory } = useCanvasStore()
  const conversationHistoryRef = useRef<AIMessage[]>(conversationHistory)

  /** 将 history 持久化到服务器（fire-and-forget） */
  const persistHistory = useCallback((conversationId: string, history: AIMessage[]) => {
    historyService.saveHistory(conversationId, history)
  }, [])

  // 同步 store 到 ref
  useEffect(() => {
    conversationHistoryRef.current = conversationHistory
  }, [conversationHistory])

  useEffect(() => {
    callbacksRef.current = options
  }, [options])

  /**
   * 发送消息并获取流式响应
   * @param userMessage 用户消息
   * @param preferences 偏好设置
   * @param history 可选的历史对话记录（用于连续对话）
   * @param images 图片列表（多模态）
   * @param compressedMemory 压缩后的相关记忆文本，注入 systemPrompt
   * @param isOnboarding 是否为新手引导模式
   * @param conversationId 当前对话 ID，用于持久化历史
   */
  const sendMessage = useCallback(async (
    userMessage: string,
    preferences: string[] = [],
    history?: AIMessage[],
    images: string[] = [],
    compressedMemory?: string,
    isOnboarding?: boolean,
    conversationId?: string
  ) => {
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // 如果有图片，构造多模态内容数组
    const userContent = images.length > 0
      ? [
          { type: 'text', text: userMessage },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img }
          }))
        ]
      : userMessage

    // 如果有外部传入的历史，使用它；否则使用内部保存的历史
    const messages: AIMessage[] = history ? [...history] : [...conversationHistoryRef.current]
    // 添加当前用户消息
    messages.push({ role: 'user', content: userContent as any })

    let fullText = ''
    let fullReasoning = ''

    try {
      for await (const chunk of streamAI(messages, preferences, signal, compressedMemory, isOnboarding)) {
        if (chunk.type === 'content') {
          fullText += chunk.content
          callbacksRef.current.onStream?.(chunk.content)
        } else if (chunk.type === 'reasoning') {
          fullReasoning += chunk.content
          callbacksRef.current.onThinking?.(chunk.content)
        }
      }

      // 保存到对话历史：用户消息 + AI回复（仅当回复非空时）
      if (fullText) {
        const nextHistory: AIMessage[] = [
          ...messages,
          {
            role: 'assistant',
            content: fullText,
            reasoning_content: fullReasoning || undefined
          }
        ]
        setConversationHistory(nextHistory)
        if (conversationId) persistHistory(conversationId, nextHistory)
      } else {
        // 如果回复为空，可能需要从历史中移除这一轮的用户消息，避免下一轮出错
        setConversationHistory(messages.slice(0, -1))
      }

      callbacksRef.current.onComplete?.(fullText)
      return fullText
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // 如果是用户主动停止，不调用 onError
      if (errorMessage === '生成已停止') {
        // 保存已生成的部分回复
        if (fullText) {
          const nextHistory: AIMessage[] = [
            ...messages,
            {
              role: 'assistant',
              content: fullText,
              reasoning_content: fullReasoning || undefined
            }
          ]
          setConversationHistory(nextHistory)
          if (conversationId) persistHistory(conversationId, nextHistory)
        }
        callbacksRef.current.onStopped?.()
        return fullText
      }

      callbacksRef.current.onError?.(errorMessage)
      return ''
    } finally {
      abortControllerRef.current = null
    }
  }, [setConversationHistory, persistHistory])

  /**
   * 重置对话历史（新对话时调用）
   */
  const resetHistory = useCallback(() => {
    setConversationHistory([])
  }, [setConversationHistory])

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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  /**
   * 检查是否正在生成中
   */
  const isGenerating = useCallback(() => {
    return abortControllerRef.current !== null
  }, [])

  return {
    sendMessage,
    sendMessageSync,
    cancel,
    resetHistory,
    isGenerating
  }
}
