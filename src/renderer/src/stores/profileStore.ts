import { create } from 'zustand'
import type { Profile, PreferenceRule } from '@shared/types'
import { STORAGE_FILES, FEEDBACK_TRIGGERS, CONFIDENCE_CONFIG } from '@shared/constants'
import { storageService } from '../services/storageService'

/**
 * 用户偏好管理
 * 负责管理用户偏好规则的检测、存储和应用
 */

interface ProfileState {
  profile: Profile
  
  // 加载
  loadProfile: () => Promise<void>
  
  // 偏好管理
  detectFeedback: (message: string) => PreferenceRule | null
  addPreference: (rule: PreferenceRule) => Promise<void>
  removePreference: (preferenceText: string) => Promise<void>
  
  // 查询
  getPreferencesForPrompt: () => string[]
  getHighConfidenceRules: () => PreferenceRule[]
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: { rules: [] },

  loadProfile: async () => {
    try {
      const content = await storageService.read(STORAGE_FILES.PROFILE)
      if (content) {
        const profile = JSON.parse(content) as Profile
        set({ profile })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  },

  detectFeedback: (message: string): PreferenceRule | null => {
    const trimmedMessage = message.trim().toLowerCase()
    
    for (const trigger of FEEDBACK_TRIGGERS) {
      for (const keyword of trigger.keywords) {
        if (trimmedMessage.includes(keyword.toLowerCase())) {
          const { profile } = get()
          const existingRule = profile.rules.find(r => r.preference === trigger.preference)
          
          if (existingRule) {
            // 更新现有规则的置信度
            return {
              ...existingRule,
              confidence: Math.min(
                existingRule.confidence + CONFIDENCE_CONFIG.INCREMENT,
                CONFIDENCE_CONFIG.MAX
              ),
              updatedAt: new Date().toISOString().split('T')[0]
            }
          }
          
          // 创建新规则
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
  },

  addPreference: async (newRule: PreferenceRule) => {
    const { profile } = get()
    
    const existingIndex = profile.rules.findIndex(r => r.preference === newRule.preference)
    
    let updatedRules: PreferenceRule[]
    if (existingIndex >= 0) {
      updatedRules = [...profile.rules]
      updatedRules[existingIndex] = newRule
    } else {
      updatedRules = [...profile.rules, newRule]
    }
    
    const updatedProfile = { ...profile, rules: updatedRules }
    set({ profile: updatedProfile })
    
    await storageService.write(
      STORAGE_FILES.PROFILE,
      JSON.stringify(updatedProfile, null, 2)
    )
  },

  removePreference: async (preferenceText: string) => {
    const { profile } = get()
    const updatedRules = profile.rules.filter(r => r.preference !== preferenceText)
    const updatedProfile = { ...profile, rules: updatedRules }
    set({ profile: updatedProfile })
    await storageService.write(
      STORAGE_FILES.PROFILE,
      JSON.stringify(updatedProfile, null, 2)
    )
  },

  getPreferencesForPrompt: (): string[] => {
    const { profile } = get()
    return profile.rules
      .filter(r => r.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .map(r => r.preference)
  },

  getHighConfidenceRules: (): PreferenceRule[] => {
    const { profile } = get()
    return profile.rules
      .filter(r => r.confidence >= 0.7)
      .sort((a, b) => b.confidence - a.confidence)
  }
}))
