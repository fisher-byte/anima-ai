/**
 * AI服务层
 * 
 * 封装OpenAI API调用，支持流式输出和超时控制
 */

import { API_CONFIG, AI_CONFIG, DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
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
    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',runId:'pre-fix',hypothesisId:'H1',location:'ai.ts:fetchWithTimeout:beforeFetch',message:'fetch start',data:{urlOrigin:(() => { try { return new URL(url).origin } catch { return 'invalid-url' } })(),urlPath:(() => { try { return new URL(url).pathname } catch { return '' } })(),method:(options as any)?.method || 'GET',hasAuthHeader:!!(options as any)?.headers && String(((options as any).headers as any)['Authorization'] || '').startsWith('Bearer '),timeoutMs},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',runId:'pre-fix',hypothesisId:'H1',location:'ai.ts:fetchWithTimeout:catch',message:'fetch failed',data:{errorName:(error as any)?.name || typeof error,errorMessage:(error as any)?.message || String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',location:'ai.ts:50',message:'getApiKey called',data:{envKeys:Object.keys(import.meta.env).filter(k=>k.includes('API'))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 开发模式：从环境变量获取
    // @ts-ignore - Vite环境变量
    const envKey = import.meta.env.RENDERER_VITE_API_KEY || ''

    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',location:'ai.ts:57',message:'envKey check',data:{hasEnvKey:!!envKey,keyLength:envKey?.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
  const { currentConversation, addNode, appendConversation, getRelevantMemories } = get()
  if (!currentConversation) return

  // 检索相关记忆并注入 system prompt
  const memories = await getRelevantMemories(currentConversation.userMessage)
  const memoryContext = memories.length > 0 
    ? `\n\n以下是与当前话题相关的历史对话片段：\n${memories.map((m, i) => `[记忆 ${i+1}]: 用户说 "${m.userMessage}", AI 回答 "${m.assistantMessage.slice(0, 100)}..."`).join('\n')}`
    : ''

  // 组装system prompt
  let systemPrompt = DEFAULT_SYSTEM_PROMPT + memoryContext
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

  const response = await fetchWithTimeout(
    `${API_CONFIG.BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: AI_CONFIG.MODEL,
        messages: fullMessages,
        max_tokens: AI_CONFIG.MAX_TOKENS,
        temperature: AI_CONFIG.TEMPERATURE,
        stream: false
      })
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('API Key无效，请检查.env配置')
    }
    throw new Error(`API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || ''
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

    const response = await fetchWithTimeout(
      `${API_CONFIG.BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL,
          messages: fullMessages,
          max_tokens: AI_CONFIG.MAX_TOKENS,
          temperature: AI_CONFIG.TEMPERATURE,
          stream: true
        })
      }
    )

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

    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',location:'ai.ts:streamAI',message:'system prompt with memories',data:{systemPrompt},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
