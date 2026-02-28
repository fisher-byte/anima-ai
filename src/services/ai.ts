/**
 * AI服务层
 * 
 * 封装OpenAI API调用，支持流式输出
 */

import { API_CONFIG, AI_CONFIG, DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
import type { AIMessage } from '../shared/types'

interface AIResponse {
  content: string
  error?: string
}

/**
 * 调用AI API（非流式）
 */
export async function callAI(
  messages: AIMessage[],
  preferences: string[] = []
): Promise<AIResponse> {
  try {
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

    const response = await fetch(`${API_CONFIG.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.API_KEY}`
      },
      body: JSON.stringify({
        model: AI_CONFIG.MODEL,
        messages: fullMessages,
        max_tokens: AI_CONFIG.MAX_TOKENS,
        temperature: AI_CONFIG.TEMPERATURE,
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return {
      content: data.choices[0]?.message?.content || ''
    }
  } catch (error) {
    console.error('AI call failed:', error)
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 调用AI API（流式）
 */
export async function* streamAI(
  messages: AIMessage[],
  preferences: string[] = []
): AsyncGenerator<string, AIResponse, unknown> {
  try {
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

    const response = await fetch(`${API_CONFIG.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.API_KEY}`
      },
      body: JSON.stringify({
        model: AI_CONFIG.MODEL,
        messages: fullMessages,
        max_tokens: AI_CONFIG.MAX_TOKENS,
        temperature: AI_CONFIG.TEMPERATURE,
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    let fullContent = ''
    const decoder = new TextDecoder()

    while (true) {
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
            const content = parsed.choices[0]?.delta?.content
            if (content) {
              fullContent += content
              yield content
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    return { content: fullContent }
  } catch (error) {
    console.error('AI stream failed:', error)
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 生成节点标题
 */
export async function generateNodeTitle(content: string): Promise<string> {
  const messages: AIMessage[] = [
    {
      role: 'user',
      content: `请用不超过8个字总结以下内容的主题：\n\n${content.slice(0, 200)}`
    }
  ]

  const response = await callAI(messages)
  return response.content.slice(0, 8).trim() || '未命名'
}

/**
 * 生成关键词
 */
export async function generateKeywords(content: string): Promise<string[]> {
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
}
