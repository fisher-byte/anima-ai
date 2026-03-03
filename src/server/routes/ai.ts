/**
 * AI proxy route
 *
 * POST /api/ai/stream
 * Body: { messages: AIMessage[], preferences: string[], compressedMemory?: string }
 * Response: text/event-stream (SSE)
 *
 * Reads API key from the config table, forwards the request to Kimi/OpenAI,
 * and streams the response back to the browser as SSE events.
 *
 * SSE event format:
 *   data: {"type":"content","content":"..."}
 *   data: {"type":"reasoning","content":"..."}
 *   data: {"type":"done","fullText":"..."}
 *   data: {"type":"error","message":"..."}
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db'
import { DEFAULT_SYSTEM_PROMPT, ONBOARDING_SYSTEM_PROMPT, AI_CONFIG, MULTIMODAL_MODELS } from '../../shared/constants'
import type { AIMessage } from '../../shared/types'

export const aiRoutes = new Hono()

interface AIRequestBody {
  messages: AIMessage[]
  preferences?: string[]
  compressedMemory?: string
  isOnboarding?: boolean
}

aiRoutes.post('/stream', async (c) => {
  const body = await c.req.json<AIRequestBody>()
  const { messages, preferences = [], compressedMemory, isOnboarding = false } = body

  // Retrieve API key from DB
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined
  const apiKey = row?.value ?? ''

  if (!apiKey) {
    return c.json({ error: 'API Key 未配置，请在设置中填写' }, 400)
  }

  const modelRow = db.prepare('SELECT value FROM config WHERE key = ?').get('model') as
    | { value: string }
    | undefined
  const model = modelRow?.value ?? AI_CONFIG.MODEL

  const baseUrlRow = db.prepare('SELECT value FROM config WHERE key = ?').get('baseUrl') as
    | { value: string }
    | undefined
  const baseUrl = (baseUrlRow?.value ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '')

  // 注入当前日期
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  // 选择 system prompt：引导模式用轻量版，不注入偏好和记忆
  let systemPrompt: string
  if (isOnboarding) {
    systemPrompt = ONBOARDING_SYSTEM_PROMPT.replace('{{DATE}}', today)
  } else {
    systemPrompt = DEFAULT_SYSTEM_PROMPT.replace('{{DATE}}', today)

    // 注入进化基因（偏好规则）
    if (preferences.length > 0) {
      systemPrompt += '\n\n【用户进化基因 - 请严格遵守】\n'
      preferences.forEach((pref, idx) => {
        systemPrompt += `${idx + 1}. ${pref}\n`
      })
    }

    // 注入压缩记忆
    if (compressedMemory?.trim()) {
      systemPrompt += '\n\n【相关记忆片段 - 供参考】\n'
      systemPrompt += compressedMemory.trim()
    }

    // 注入用户画像
    try {
      const profile = db.prepare('SELECT * FROM user_profile WHERE id = 1').get() as Record<string, string | null> | undefined
      if (profile) {
        const parts: string[] = []
        if (profile.occupation) parts.push(`职业：${profile.occupation}`)
        if (profile.location) parts.push(`位置：${profile.location}`)
        if (profile.interests) {
          const arr = JSON.parse(profile.interests) as string[]
          if (arr.length) parts.push(`兴趣：${arr.join('、')}`)
        }
        if (profile.tools) {
          const arr = JSON.parse(profile.tools) as string[]
          if (arr.length) parts.push(`常用工具：${arr.join('、')}`)
        }
        if (profile.goals) {
          const arr = JSON.parse(profile.goals) as string[]
          if (arr.length) parts.push(`当前关注：${arr.join('、')}`)
        }
        if (profile.writing_style) parts.push(`偏好回答风格：${profile.writing_style}`)
        if (parts.length > 0) {
          systemPrompt += '\n\n【用户画像 - 请据此个性化回答】\n' + parts.join('\n')
        }
      }
    } catch {
      // 画像注入失败不影响主流程
    }
  }

  const fullMessages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  const requestBody: Record<string, unknown> = {
    model,
    messages: fullMessages,
    max_tokens: AI_CONFIG.MAX_TOKENS,
    temperature: AI_CONFIG.TEMPERATURE,
    stream: true
  }

  // Enable web search for capable models
  if (MULTIMODAL_MODELS.includes(model as typeof MULTIMODAL_MODELS[number])) {
    requestBody.tools = [{ type: 'builtin_function', function: { name: '$web_search' } }]
  }

  return streamSSE(c, async (stream) => {
    let fullContent = ''
    let reasoningContent = ''
    const toolCalls: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {}

    const sendEvent = async (data: Record<string, unknown>) => {
      await stream.writeSSE({ data: JSON.stringify(data) })
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: c.req.raw.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        await sendEvent({ type: 'error', message: `API error ${response.status}: ${errorText}` })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        await sendEvent({ type: 'error', message: 'No response body from upstream' })
        return
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter((l) => l.trim() !== '')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            const finishReason = parsed.choices?.[0]?.finish_reason

            if (delta?.reasoning_content) {
              reasoningContent += delta.reasoning_content
              await sendEvent({ type: 'reasoning', content: delta.reasoning_content })
            }

            if (delta?.content) {
              fullContent += delta.content
              await sendEvent({ type: 'content', content: delta.content })
            }

            // Accumulate tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx: number = tc.index
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    id: tc.id,
                    type: tc.type,
                    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' }
                  }
                } else {
                  if (tc.function?.arguments) {
                    toolCalls[idx].function.arguments += tc.function.arguments
                  }
                }
              }
            }

            // Handle tool call completion - trigger second round
            if (finishReason === 'tool_calls' && Object.keys(toolCalls).length > 0) {
              const toolCallsArray = Object.values(toolCalls)

              const assistantMsg: AIMessage = {
                role: 'assistant',
                content: fullContent || '',
                tool_calls: toolCallsArray,
                reasoning_content: reasoningContent || 'web_search'
              }

              const toolMessages: AIMessage[] = toolCallsArray.map((tc) => ({
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: tc.function.arguments
              }))

              // Second round request
              const round2Body: Record<string, unknown> = {
                model,
                messages: [...fullMessages, assistantMsg, ...toolMessages],
                max_tokens: AI_CONFIG.MAX_TOKENS,
                temperature: AI_CONFIG.TEMPERATURE,
                stream: true
              }

              const round2Res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify(round2Body),
                signal: c.req.raw.signal
              })

              if (round2Res.ok) {
                const reader2 = round2Res.body?.getReader()
                if (reader2) {
                  while (true) {
                    const { done, value } = await reader2.read()
                    if (done) break
                    const chunk2 = decoder.decode(value, { stream: true })
                    for (const line2 of chunk2.split('\n').filter((l) => l.trim())) {
                      if (!line2.startsWith('data: ')) continue
                      const data2 = line2.slice(6)
                      if (data2 === '[DONE]') continue
                      try {
                        const p2 = JSON.parse(data2)
                        const d2 = p2.choices?.[0]?.delta
                        if (d2?.reasoning_content) {
                          reasoningContent += d2.reasoning_content
                          await sendEvent({ type: 'reasoning', content: d2.reasoning_content })
                        }
                        if (d2?.content) {
                          fullContent += d2.content
                          await sendEvent({ type: 'content', content: d2.content })
                        }
                      } catch {
                        // ignore parse errors
                      }
                    }
                  }
                }
              }
            }
          } catch {
            // ignore JSON parse errors in stream
          }
        }
      }

      await sendEvent({ type: 'done', fullText: fullContent })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await sendEvent({ type: 'done', fullText: fullContent })
        return
      }
      await sendEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
})
