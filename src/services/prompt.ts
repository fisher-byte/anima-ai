/**
 * Prompt组装服务
 * 
 * 组装System Prompt，注入用户历史偏好
 */

import { DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
import type { PreferenceRule, AIMessage } from '../shared/types'

/**
 * 组装System Prompt
 * @param preferences 用户偏好列表
 * @returns 完整的System Prompt
 */
export function buildSystemPrompt(preferences: string[]): string {
  if (preferences.length === 0) {
    return DEFAULT_SYSTEM_PROMPT
  }

  let prompt = DEFAULT_SYSTEM_PROMPT
  prompt += '\n\n以下是用户的历史偏好，请在回答中遵循这些偏好：\n'
  
  preferences.forEach((pref, idx) => {
    prompt += `${idx + 1}. ${pref}\n`
  })
  
  prompt += '\n注意：不要在你的回答中提及这些偏好规则，直接应用即可。'
  
  return prompt
}

/**
 * 组装带历史偏好的消息列表
 * @param userMessage 用户当前消息
 * @param preferences 用户偏好列表
 * @returns 完整的消息列表
 */
export function buildMessages(
  userMessage: string,
  preferences: string[]
): AIMessage[] {
  const systemPrompt = buildSystemPrompt(preferences)
  
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]
}

/**
 * 检测本次回答是否应用了特定偏好
 * @param response AI回答内容
 * @param preference 偏好规则
 * @returns 是否应用了该偏好
 */
export function detectPreferenceApplication(
  response: string,
  preference: PreferenceRule
): boolean {
  const responseLower = response.toLowerCase()
  const prefText = preference.preference.toLowerCase()
  
  // 根据偏好类型检测应用情况
  if (prefText.includes('简洁')) {
    // 简洁偏好：检测回答长度（少于200字视为简洁）
    return response.length < 200
  }
  
  if (prefText.includes('避免')) {
    // 避免偏好：无法直接检测，依赖用户反馈
    return false
  }
  
  if (prefText.includes('组织')) {
    // 结构化偏好：检测是否有序号或列表
    return /\d+[.、]|[-*]/.test(response)
  }
  
  // 默认检测：回答中是否体现了偏好的关键词
  const keywords = prefText.split(/[，,。.;；]/).filter(k => k.length > 4)
  return keywords.some(kw => responseLower.includes(kw.slice(0, 6)))
}

/**
 * 检测本次回答应用了哪些偏好
 * @param response AI回答内容
 * @param allRules 所有偏好规则
 * @returns 被应用的偏好列表
 */
export function detectAppliedPreferences(
  response: string,
  allRules: PreferenceRule[]
): PreferenceRule[] {
  return allRules.filter(rule => 
    detectPreferenceApplication(response, rule)
  )
}

/**
 * 生成灰字提示文本
 * @param appliedPreferences 被应用的偏好列表
 * @returns 提示文本
 */
export function generateGrayHint(appliedPreferences: string[]): string {
  if (appliedPreferences.length === 0) {
    return ''
  }

  // 简化偏好描述
  const simplified = appliedPreferences.map(pref => {
    if (pref.includes('简洁')) return '简洁表达'
    if (pref.includes('避免')) return '避免特定内容'
    if (pref.includes('组织')) return '结构化输出'
    if (pref.includes('重新')) return '重新理解'
    return '你的偏好'
  })

  if (simplified.length === 1) {
    return `我记得你上次更喜欢${simplified[0]}。`
  }

  // 多个偏好
  const last = simplified.pop()
  return `我记得你上次更喜欢${simplified.join('、')}和${last}。`
}

/**
 * 根据置信度筛选有效偏好
 * @param rules 所有规则
 * @param threshold 阈值，默认0.5
 * @returns 有效的偏好文本列表
 */
export function filterValidPreferences(
  rules: PreferenceRule[],
  threshold: number = 0.5
): string[] {
  return rules
    .filter(rule => rule.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence)
    .map(rule => rule.preference)
}

/**
 * 格式化多轮对话历史（用于上下文）
 * @param history 历史消息
 * @returns 格式化后的文本
 */
export function formatConversationHistory(history: AIMessage[]): string {
  return history
    .filter(msg => msg.role !== 'system')
    .map(msg => {
      const role = msg.role === 'user' ? '用户' : 'AI'
      return `${role}：${msg.content}`
    })
    .join('\n\n')
}

/**
 * 生成节点标题Prompt
 * @param userMessage 用户消息
 * @param assistantMessage AI回答
 * @returns 用于生成标题的Prompt
 */
export function generateTitlePrompt(
  userMessage: string,
  assistantMessage: string
): string {
  return `请用不超过8个字总结以下对话的主题：\n\n用户：${userMessage.slice(0, 100)}\nAI：${assistantMessage.slice(0, 100)}`
}

/**
 * 生成关键词提取Prompt
 * @param content 内容文本
 * @returns 用于提取关键词的Prompt
 */
export function generateKeywordsPrompt(content: string): string {
  return `请从以下内容中提取2-3个关键词（每个词2-6个字），用逗号分隔：\n\n${content.slice(0, 300)}`
}
