/**
 * 负反馈识别服务
 * 
 * 检测用户反馈中的负向表达，提取偏好规则
 */

import { FEEDBACK_TRIGGERS, CONFIDENCE_CONFIG } from '../shared/constants'
import type { PreferenceRule } from '../shared/types'

/**
 * 检测消息中是否包含负反馈
 * @param message 用户消息
 * @returns 检测到的偏好规则，如果没有则返回null
 */
export function detectNegativeFeedback(message: string): PreferenceRule | null {
  const trimmedMessage = message.trim().toLowerCase()
  
  for (const trigger of FEEDBACK_TRIGGERS) {
    for (const keyword of trigger.keywords) {
      if (trimmedMessage.includes(keyword.toLowerCase())) {
        return {
          trigger: keyword,
          preference: trigger.preference,
          confidence: CONFIDENCE_CONFIG.INITIAL,
          updatedAt: new Date().toISOString().split('T')[0]
        }
      }
    }
  }
  
  return null
}

/**
 * 批量检测多条消息中的反馈
 * @param messages 用户消息数组
 * @returns 所有检测到的偏好规则
 */
export function detectMultipleFeedback(messages: string[]): PreferenceRule[] {
  const rules: PreferenceRule[] = []
  const seenPreferences = new Set<string>()
  
  for (const message of messages) {
    const rule = detectNegativeFeedback(message)
    if (rule && !seenPreferences.has(rule.preference)) {
      rules.push(rule)
      seenPreferences.add(rule.preference)
    }
  }
  
  return rules
}

/**
 * 更新偏好规则的置信度
 * @param existingRule 现有规则
 * @returns 更新后的规则
 */
export function updateConfidence(existingRule: PreferenceRule): PreferenceRule {
  return {
    ...existingRule,
    confidence: Math.min(
      existingRule.confidence + CONFIDENCE_CONFIG.INCREMENT,
      CONFIDENCE_CONFIG.MAX
    ),
    updatedAt: new Date().toISOString().split('T')[0]
  }
}

/**
 * 检查用户反馈是否包含学习触发词
 * @param message 用户消息
 * @returns 是否包含触发词
 */
export function containsTriggerWord(message: string): boolean {
  const trimmedMessage = message.trim().toLowerCase()
  
  for (const trigger of FEEDBACK_TRIGGERS) {
    for (const keyword of trigger.keywords) {
      if (trimmedMessage.includes(keyword.toLowerCase())) {
        return true
      }
    }
  }
  
  return false
}

/**
 * 获取所有支持的触发词（用于调试或提示）
 */
export function getAllTriggerWords(): string[] {
  return FEEDBACK_TRIGGERS.flatMap(t => t.keywords)
}

/**
 * 分析反馈强度（简单实现）
 * @param message 用户消息
 * @returns 强度分数 0-1
 */
export function analyzeFeedbackIntensity(message: string): number {
  const trimmedMessage = message.trim().toLowerCase()
  let intensity = 0
  
  // 强烈否定词增加强度
  const strongNegatives = ['完全不对', '完全错误', '完全没用', '太差了']
  for (const word of strongNegatives) {
    if (trimmedMessage.includes(word)) {
      intensity += 0.4
    }
  }
  
  // 一般否定词
  const normalNegatives = ['不对', '错了', '有问题', '不合适']
  for (const word of normalNegatives) {
    if (trimmedMessage.includes(word)) {
      intensity += 0.2
    }
  }
  
  // 标点符号表达情绪
  if (trimmedMessage.includes('!!') || trimmedMessage.includes('！')) {
    intensity += 0.1
  }
  
  return Math.min(intensity, 1.0)
}
