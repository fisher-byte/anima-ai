/**
 * conversationUtils.ts
 * 对话相关的类型定义、常量和工具函数
 */

import type { Conversation, FileAttachment } from '@shared/types'

// ── 新手引导预设消息 ──────────────────────────────────────────────────────────
// 引导分4个阶段：
//   phase 0 → AI 问候，请用户自我介绍
//   phase 1 → 展示预设样例回复（不调AI）+ 内嵌风格评价提问，直接跳到 phase 2
//   phase 2 → 用户给出偏好 → 收集进化基因 + AI 主动抛话题请用户回答
//   phase 3 → 用户回答 → AI 正常处理 + 引导关窗

/** phase 0：打招呼，请用户自我介绍 */
export const ONBOARDING_GREETING = `你好，我是 EvoCanvas。这里是你的一个创造空间——每次你跟我说话，这段对话就会被记录下来，慢慢连成一张只属于你的图。

先说说你是谁，在做什么？`

/** phase 1：预设样例回复 + 内嵌风格评价提问（替代 AI 调用，避免空洞问候） */
export const ONBOARDING_DEFAULT_RESPONSE = `让我展示一下我平时怎么回答——举个例子：

如果你问我"怎么快速进入一个新领域"，我不会直接给你一个步骤清单。我会先搞清楚你的目的——是要真正做事，还是要能说得头头是道？这两种需求的学习路径差很远。

要"做事"就找一个最小的实战任务先做起来，遇到不懂再去查；要"说清楚"就先建立领域的基本框架，把核心概念和它们之间的关系搞清楚。

这就是我通常的风格：先拆问题，再给方向，不给万金油。

---

**你觉得这种方式适合你吗？** 太长？太分析性了？还是更喜欢直接给结论？

你的反馈会写入我的**进化基因**，影响以后每次回复的方式。`

/** phase 2 确认进化基因收集后注入：说清楚产品用法 + 主动抛话题 */
export const ONBOARDING_GENE_SAVED = `✦ 进化基因已记录，以后我会按这个方向回复你。

顺便说一下这里的用法——**你不需要为不同话题开不同的窗口**。工作、想法、随手记的什么都行，往这里说就好，我来处理背后的记忆和关联。

来，试一下——**你最近在脑子里转了挺久、但还没想清楚的一件事是什么？**`

/** phase 3 回答后注入：引导关闭，说节点生成 */
export const ONBOARDING_CLOSE_HINT = `

---

✦ 你刚才说的内容已经被记录下来了。

点右上角 **×** 关闭，就能在画布上看到它以节点的形式出现。`

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
    const reasoningMatch = aiContent.includes('[/THINKING]')
      ? aiContent.match(/^思考：([\s\S]*?)\n\n\[\/THINKING\]\n\n([\s\S]*)$/)
      : aiContent.match(/^思考：([\s\S]*)\n\n([\s\S]+)$/)
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
  // 哨兵格式（已关闭对话）
  let s = text.replace(/^思考：[\s\S]*?\[\/THINKING\]\n\n/, '').trim()
  // 流式/旧格式：思考内容未加哨兵时也剥掉
  if (s.startsWith('思考：')) {
    // 有哨兵时已处理，这里处理无哨兵的流式情况：剥掉整个思考块到第一个双换行
    s = s.replace(/^思考：[\s\S]*?\n\n/, '').trim()
    // 如果整段都是思考（还没有正文），暂时返回空串
    if (s.startsWith('思考：')) s = ''
  }
  // 多轮格式兜底：#N\n用户：...\nAI：\n...
  s = s.replace(/^#\s*\d+\s*\n+用户[：:][\s\S]*?AI[：:]\s*\n?/m, '').trim()
  s = s.replace(/^#+\s*\d+\s*\n?/, '').trim()
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
