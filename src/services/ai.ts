/**
 * AI服务层
 * 
 * 封装OpenAI API调用，支持流式输出和超时控制
 */

import { API_CONFIG, AI_CONFIG, DEFAULT_SYSTEM_PROMPT, MULTIMODAL_MODELS } from '../shared/constants'
import type { AIMessage } from '../shared/types'

interface AIResponse {
  content: string
  error?: string
}

/**
 * 带超时的fetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = API_CONFIG.TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  }
}

/**
 * 获取API Key（从环境变量或主进程获取）
 */
async function getApiKey(): Promise<string> {
  try {
    // 如果已有缓存，直接返回
    if (API_CONFIG.API_KEY) {
      return API_CONFIG.API_KEY
    }

    // 开发模式：从环境变量获取
    // @ts-ignore - Vite环境变量
    const envKey = import.meta.env.RENDERER_VITE_API_KEY || ''

    if (envKey) {
      API_CONFIG.API_KEY = envKey
      return envKey
    }

    // 生产模式：从主进程安全获取
    const key = await window.electronAPI.config.getApiKey()
    API_CONFIG.API_KEY = key
    return key
  } catch (error) {
    console.error('Failed to get API key:', error)
    return API_CONFIG.API_KEY
  }
}

/**
 * 设置API Key（保存到主进程）
 */
export async function setApiKey(apiKey: string): Promise<boolean> {
  try {
    const success = await window.electronAPI.config.setApiKey(apiKey)
    if (success) {
      API_CONFIG.API_KEY = apiKey
    }
    return success
  } catch (error) {
    console.error('Failed to set API key:', error)
    return false
  }
}

/**
 * 调用AI API（非流式）
 */
export async function callAI(
  messages: AIMessage[],
  preferences: string[] = []
): Promise<AIResponse> {
  try {
    const apiKey = await getApiKey()
    if (!apiKey) {
      throw new Error('API Key未配置')
    }

    // 组装system prompt
    let systemPrompt = DEFAULT_SYSTEM_PROMPT
    if (preferences.length > 0) {
      systemPrompt += '\n\n以下是用户的历史偏好：\n'
      preferences.forEach((pref, idx) => {
        systemPrompt += `${idx + 1}. ${pref}\n`
      })
    }

    const fullMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    // 构造请求体
    const body: any = {
      model: AI_CONFIG.MODEL,
      messages: fullMessages,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      temperature: AI_CONFIG.TEMPERATURE,
      stream: false
    }

    // 为 Kimi 2.5 或其他具备能力的模型开启联网搜索
    if (MULTIMODAL_MODELS.includes(AI_CONFIG.MODEL as any)) {
      body.tools = [{ type: 'builtin_function', function: { name: '$web_search' } }]
    }

    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.choices[0]?.message?.content || ''
    }
  } catch (error) {
    console.error('AI call failed:', error)
    return { content: '', error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export interface AIStreamChunk {
  type: 'content' | 'reasoning'
  content: string
}

/**
 * 调用AI API（流式）
 */
export async function* streamAI(
  messages: AIMessage[],
  preferences: string[] = [],
  signal?: AbortSignal
): AsyncGenerator<AIStreamChunk, AIResponse, unknown> {
  try {
    const apiKey = await getApiKey()
    if (!apiKey) {
      throw new Error('API Key未配置，请在.env文件中配置VITE_API_KEY')
    }

    // 组装system prompt
    let systemPrompt = DEFAULT_SYSTEM_PROMPT
    if (preferences.length > 0) {
      systemPrompt += '\n\n以下是用户的历史偏好：\n'
      preferences.forEach((pref, idx) => {
        systemPrompt += `${idx + 1}. ${pref}\n`
      })
    }

    const fullMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    // 构造请求体
    const body: any = {
      model: AI_CONFIG.MODEL,
      messages: fullMessages,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      temperature: AI_CONFIG.TEMPERATURE,
      stream: true
    }

    // 为 Kimi 2.5 或其他具备能力的模型开启联网搜索
    if (MULTIMODAL_MODELS.includes(AI_CONFIG.MODEL as any)) {
      body.tools = [{ type: 'builtin_function', function: { name: '$web_search' } }]
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT)

    // 如果有外部 signal，监听它
    if (signal) {
      signal.addEventListener('abort', () => {
        controller.abort()
        clearTimeout(timeoutId)
      })
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('API Key无效，请检查.env配置')
      }
      throw new Error(`API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    let fullContent = ''
    let reasoningContent = ''
    let toolCalls: any[] = []
    const decoder = new TextDecoder()

    while (true) {
      // 检查是否被取消
      if (signal?.aborted) {
        throw new Error('生成已停止')
      }

      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices[0]?.delta
            const finishReason = parsed.choices[0]?.finish_reason
            
            // 处理推理内容 (Kimi 2.5 Thinking)
            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              yield { type: 'reasoning', content: delta.reasoning_content }
            }

            // 处理内容
            if (delta?.content) {
              fullContent += delta.content
              yield { type: 'content', content: delta.content }
            }

            // 处理工具调用
            if (delta?.tool_calls) {
              delta.tool_calls.forEach((tc: any) => {
                const idx = tc.index
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id, type: tc.type, function: { name: tc.function?.name, arguments: tc.function?.arguments || '' } }
                } else {
                  if (tc.function?.arguments) {
                    toolCalls[idx].function.arguments += tc.function.arguments
                  }
                }
              })
            }

            // 如果流结束且是工具调用，触发下一轮
            if (finishReason === 'tool_calls' && toolCalls.length > 0) {
              // 构造包含工具调用的消息
              const assistantMessage: AIMessage = {
                role: 'assistant',
                content: fullContent || '',
                tool_calls: toolCalls,
                // Kimi 2.5 要求在 tool call 轮次也提供 reasoning_content
                // 若模型未返回 reasoning_content，则填充最小非空占位避免 400
                reasoning_content: reasoningContent || 'web_search'
              }

              // 构造对应的工具返回消息（针对 $web_search，Kimi 需要一个 tool 消息）
              const toolMessages: AIMessage[] = toolCalls.map(tc => ({
                role: 'tool',
                tool_call_id: tc.id,
                content: tc.function.arguments // 传回 Kimi 刚才给 of 的参数（包含 search_id）
              }))

              // 递归调用下一轮
              const nextMessages = [...messages, assistantMessage, ...toolMessages]
              for await (const nextChunk of streamAI(nextMessages, preferences, signal)) {
                yield nextChunk
                if (nextChunk.type === 'content') {
                  fullContent += nextChunk.content
                } else if (nextChunk.type === 'reasoning') {
                  reasoningContent += nextChunk.content
                }
              }
            }
          } catch (e) {
            // 忽略解析错误
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
    throw error instanceof Error ? error : new Error('Unknown error')
  }
}

/**
 * 生成节点标题
 */
export async function generateNodeTitle(content: string): Promise<string> {
  try {
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: `请用不超过8个字总结以下内容的主题：\n\n${content.slice(0, 200)}`
      }
    ]

    const response = await callAI(messages)
    return response.content.slice(0, 8).trim() || '未命名'
  } catch (error) {
    console.error('生成节点标题失败:', error)
    return '未命名'
  }
}

/**
 * 生成关键词
 */
export async function generateKeywords(content: string): Promise<string[]> {
  try {
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: `请从以下内容中提取2-3个关键词，用逗号分隔：\n\n${content.slice(0, 300)}`
      }
    ]

    const response = await callAI(messages)
    return response.content
      .split(/[,，]/)
      .map(k => k.trim())
      .filter(k => k.length >= 2 && k.length <= 6)
      .slice(0, 3)
  } catch (error) {
    console.error('生成关键词失败:', error)
    return []
  }
}
