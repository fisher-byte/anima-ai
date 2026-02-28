/**
 * 用户偏好管理服务
 * 
 * 处理用户偏好规则的CRUD操作和持久化
 */

import type { Profile, PreferenceRule } from '../shared/types'
import { STORAGE_FILES, CONFIDENCE_CONFIG } from '../shared/constants'
import { updateConfidence } from './feedback'

/**
 * 读取用户配置文件
 * @param storage 存储服务
 * @returns 用户配置，如果不存在则返回默认配置
 */
export async function loadProfile(storage: {
  read: (filename: string) => Promise<string | null>
}): Promise<Profile> {
  try {
    const content = await storage.read(STORAGE_FILES.PROFILE)
    if (content) {
      return JSON.parse(content) as Profile
    }
  } catch (error) {
    console.error('Failed to load profile:', error)
  }
  
  return { rules: [] }
}

/**
 * 保存用户配置文件
 * @param storage 存储服务
 * @param profile 用户配置
 */
export async function saveProfile(
  storage: {
    write: (filename: string, content: string) => Promise<boolean>
  },
  profile: Profile
): Promise<void> {
  try {
    await storage.write(
      STORAGE_FILES.PROFILE,
      JSON.stringify(profile, null, 2)
    )
  } catch (error) {
    console.error('Failed to save profile:', error)
    throw error
  }
}

/**
 * 添加或更新偏好规则
 * @param profile 当前配置
 * @param newRule 新规则
 * @returns 更新后的配置
 */
export function addOrUpdateRule(profile: Profile, newRule: PreferenceRule): Profile {
  const existingIndex = profile.rules.findIndex(
    r => r.preference === newRule.preference
  )
  
  let updatedRules: PreferenceRule[]
  
  if (existingIndex >= 0) {
    // 更新现有规则（增加置信度）
    updatedRules = [...profile.rules]
    updatedRules[existingIndex] = updateConfidence(profile.rules[existingIndex])
  } else {
    // 添加新规则
    updatedRules = [...profile.rules, newRule]
  }
  
  return {
    ...profile,
    rules: updatedRules
  }
}

/**
 * 删除偏好规则
 * @param profile 当前配置
 * @param preferenceText 要删除的偏好文本
 * @returns 更新后的配置
 */
export function removeRule(profile: Profile, preferenceText: string): Profile {
  return {
    ...profile,
    rules: profile.rules.filter(r => r.preference !== preferenceText)
  }
}

/**
 * 获取高置信度偏好（用于注入Prompt）
 * @param profile 用户配置
 * @param threshold 置信度阈值，默认0.5
 * @returns 偏好文本数组
 */
export function getHighConfidencePreferences(
  profile: Profile,
  threshold: number = 0.5
): string[] {
  return profile.rules
    .filter(r => r.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence)
    .map(r => r.preference)
}

/**
 * 降低长时间未更新的偏好置信度
 * @param profile 用户配置
 * @param daysThreshold 天数阈值，默认30天
 * @returns 更新后的配置
 */
export function decayOldPreferences(
  profile: Profile,
  daysThreshold: number = 30
): Profile {
  const now = new Date()
  
  const updatedRules = profile.rules.map(rule => {
    const updatedAt = new Date(rule.updatedAt)
    const daysDiff = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysDiff > daysThreshold) {
      return {
        ...rule,
        confidence: Math.max(
          rule.confidence - 0.1,
          CONFIDENCE_CONFIG.MIN
        )
      }
    }
    
    return rule
  })
  
  return {
    ...profile,
    rules: updatedRules
  }
}

/**
 * 合并两个配置文件（用于导入/导出功能）
 * @param base 基础配置
 * @param incoming 要合并的配置
 * @returns 合并后的配置
 */
export function mergeProfiles(base: Profile, incoming: Profile): Profile {
  const mergedRules = [...base.rules]
  
  for (const incomingRule of incoming.rules) {
    const existingIndex = mergedRules.findIndex(
      r => r.preference === incomingRule.preference
    )
    
    if (existingIndex >= 0) {
      // 保留置信度更高的版本
      if (incomingRule.confidence > mergedRules[existingIndex].confidence) {
        mergedRules[existingIndex] = incomingRule
      }
    } else {
      mergedRules.push(incomingRule)
    }
  }
  
  return {
    rules: mergedRules
  }
}

/**
 * 导出配置为JSON字符串
 * @param profile 用户配置
 * @returns JSON字符串
 */
export function exportProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2)
}

/**
 * 从JSON字符串导入配置
 * @param jsonString JSON字符串
 * @returns 用户配置
 */
export function importProfile(jsonString: string): Profile {
  try {
    const parsed = JSON.parse(jsonString)
    
    // 基础验证
    if (!parsed.rules || !Array.isArray(parsed.rules)) {
      throw new Error('Invalid profile format: missing rules array')
    }
    
    return parsed as Profile
  } catch (error) {
    console.error('Failed to import profile:', error)
    throw error
  }
}

/**
 * 获取配置统计信息
 * @param profile 用户配置
 * @returns 统计信息
 */
export function getProfileStats(profile: Profile): {
  totalRules: number
  highConfidenceRules: number
  averageConfidence: number
  oldestRule: string | null
  newestRule: string | null
} {
  if (profile.rules.length === 0) {
    return {
      totalRules: 0,
      highConfidenceRules: 0,
      averageConfidence: 0,
      oldestRule: null,
      newestRule: null
    }
  }
  
  const sortedByDate = [...profile.rules].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  )
  
  const highConfidence = profile.rules.filter(r => r.confidence >= 0.7)
  const avgConfidence = profile.rules.reduce((sum, r) => sum + r.confidence, 0) / profile.rules.length
  
  return {
    totalRules: profile.rules.length,
    highConfidenceRules: highConfidence.length,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    oldestRule: sortedByDate[0].updatedAt,
    newestRule: sortedByDate[sortedByDate.length - 1].updatedAt
  }
}
