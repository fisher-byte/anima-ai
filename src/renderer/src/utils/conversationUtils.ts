/**
 * conversationUtils.ts
 * 对话相关的类型定义、常量和工具函数
 */

import type { Conversation, FileAttachment } from '@shared/types'

// ── 新手引导预设消息 ──────────────────────────────────────────────────────────
// 引导分4个阶段：
//   phase 0 → AI 问候，请用户自我介绍
//   phase 1 → 用户介绍后，AI 真实调用回应 + 追问风格偏好
//   phase 2 → 用户给出偏好 → 收集进化基因 + AI 确认 + 引导发随意问题
//   phase 3 → 用户发任意问题 → AI 正常回答 + 引导关窗

/** phase 0：打招呼，请用户自我介绍 */
export const ONBOARDING_GREETING = `你好，我是 EvoCanvas。

你说的每段对话，都会在画布上变成一个**记忆节点**，它们之间会自动连线、形成你的专属知识图谱。

先认识一下吧——你是谁，在做什么？`

/** phase 1 追问（紧跟 AI 真实回应后注入）：请用户给出风格偏好 */
export const ONBOARDING_STYLE_PROMPT = `

---

顺便问一下：我刚才这样回复你，**感觉合适吗？**

比如——太长了？太简洁了？想要更随意一点？还是别的什么？

你的反馈会直接写入我的**进化基因**，影响以后每一次回复。`

/** phase 2 确认进化基因收集后注入：引导发随意问题 */
export const ONBOARDING_GENE_SAVED = `✦ 进化基因已记录

以后我会按这个方向回复你。

现在，**随便问我一件事**——任何话题都行，看看我怎么从记忆里找线索来回答你。`

/** phase 3 回答后注入：引导关闭 */
export const ONBOARDING_CLOSE_HINT = `

---

✦ 我刚刚调用了你之前说的内容来辅助这次回答——这就是记忆系统在工作。

准备好了就点右上角 **×** 关闭，画布上会出现你的第一批记忆节点。`

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
