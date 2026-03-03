/**
 * conversationUtils.ts
 * 对话相关的类型定义、常量和工具函数
 */

import type { Conversation, FileAttachment } from '@shared/types'

// ── 新手引导预设消息 ──────────────────────────────────────────────────────────

export const ONBOARDING_GREETING = `你好！我是 EvoCanvas。

我会把你说的每一段对话变成画布上可以生长的「记忆节点」，它们相互连接、不断演化。

有一个特别的地方：我有「进化基因」系统——每当你给我反馈（比如"太长了"或"换个思路"），我就会学习并记住，慢慢形成专属于你的表达风格。

先来认识一下吧——你是谁？现在在做什么？`

export const ONBOARDING_FOLLOWUP = `我记住了 ✦

这些信息已经开始积累进你的「进化基因」了。以后的每一次对话，我都会越来越懂你。

好了，现在点击右上角的 **×** 关闭这个对话，你的第一个记忆节点就会落在画布上。关闭后，试着在输入框里说一句"你好"，开始自由探索吧。`

// ── Turn 类型 ─────────────────────────────────────────────────────────────────

export type Turn = {
  user: string
  assistant: string
  reasoning?: string
  images?: string[]
  files?: FileAttachment[]
  error?: string
  memoryCategory?: string
  memories?: { conv: Conversation; category?: string }[]
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

const MEMORY_USER_MAX = 80
const MEMORY_ASSISTANT_MAX = 150

export function compressMemoriesForPrompt(
  memories: { conv: Conversation; category?: string }[]
): string {
  if (!memories?.length) return ''
  return memories
    .map(({ conv }) => {
      const u = (conv.userMessage || '').slice(0, MEMORY_USER_MAX)
      const a = (conv.assistantMessage || '').slice(0, MEMORY_ASSISTANT_MAX)
      return `用户：${u}${conv.userMessage.length > MEMORY_USER_MAX ? '…' : ''}\n助手：${a}${conv.assistantMessage.length > MEMORY_ASSISTANT_MAX ? '…' : ''}`
    })
    .join('\n\n')
}

export function parseTurnsFromAssistantMessage(
  message: string,
  reasoning?: string,
  initialImages?: string[],
  initialFiles?: FileAttachment[]
): Turn[] | null {
  if (!message) return null
  if (!message.includes('#1\n') && !message.includes('# 1\n')) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }
  const turns: Turn[] = []
  const sectionRegex = /#\s*(\d+)\s*\n+用户[：:]\s*([\s\S]*?)\nAI[：:]\s*([\s\S]*?)(?=\n+#\s*\d+\s*\n|$)/g
  let match
  while ((match = sectionRegex.exec(message)) !== null) {
    const userContent = match[2].trim()
    let aiContent = match[3].trim()
    const index = parseInt(match[1])
    let turnReasoning: string | undefined
    const reasoningMatch = aiContent.match(/^思考：([\s\S]*?)\n\n([\s\S]*)$/)
    if (reasoningMatch) {
      turnReasoning = reasoningMatch[1].trim()
      aiContent = reasoningMatch[2].trim()
    }
    if (userContent || aiContent) {
      turns.push({
        user: userContent,
        assistant: aiContent,
        reasoning: turnReasoning,
        images: index === 1 ? initialImages : undefined,
        files: index === 1 ? initialFiles : undefined
      })
    }
  }
  if (turns.length === 0) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }
  return turns
}

export function stripLeadingNumberHeading(text: string): string {
  if (!text) return text
  let s = text.replace(/^#+\s*\d+\s*\n?/, '').trim()
  if (/AI[：:]/.test(s)) {
    s = s.replace(/^[\s\S]*?AI[：:]\s*/, '').trim()
  }
  if (/^用户[：:]/.test(s)) {
    s = s.replace(/^用户[：:][^\n]*\n?/, '').trim()
  }
  return s
}

/** 将 turns 数组构建为 AI 历史上下文，跳过空用户消息（引导预设轮次） */
export function buildAIHistory(
  turns: Turn[]
): { role: 'user' | 'assistant'; content: string }[] {
  return turns
    .filter(t => t.user?.trim())
    .flatMap(t => [
      { role: 'user' as const, content: t.user },
      ...(t.assistant ? [{ role: 'assistant' as const, content: t.assistant }] : [])
    ])
}
