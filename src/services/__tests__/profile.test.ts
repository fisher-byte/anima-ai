import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadProfile,
  saveProfile,
  addOrUpdateRule,
  removeRule,
  getHighConfidencePreferences,
  decayOldPreferences,
  mergeProfiles,
  exportProfile,
  importProfile,
  getProfileStats
} from '../profile'
import type { Profile, PreferenceRule } from '../../shared/types'
import { CONFIDENCE_CONFIG } from '../../shared/constants'

describe('profile service', () => {
  const mockStorage = {
    read: vi.fn(),
    write: vi.fn().mockResolvedValue(true)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadProfile', () => {
    it('should load profile from storage', async () => {
      const mockProfile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.7,
          updatedAt: '2026-02-28'
        }]
      }
      mockStorage.read.mockResolvedValue(JSON.stringify(mockProfile))

      const result = await loadProfile(mockStorage)
      expect(result.rules).toHaveLength(1)
      expect(result.rules[0].trigger).toBe('简洁点')
    })

    it('should return default profile when no file exists', async () => {
      mockStorage.read.mockResolvedValue(null)
      const result = await loadProfile(mockStorage)
      expect(result.rules).toHaveLength(0)
    })

    it('should handle read errors gracefully', async () => {
      mockStorage.read.mockRejectedValue(new Error('Read error'))
      const result = await loadProfile(mockStorage)
      expect(result.rules).toHaveLength(0)
    })
  })

  describe('saveProfile', () => {
    it('should save profile to storage', async () => {
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.7,
          updatedAt: '2026-02-28'
        }]
      }
      await saveProfile(mockStorage, profile)
      expect(mockStorage.write).toHaveBeenCalled()
    })

    it('should throw on write error', async () => {
      const profile: Profile = { rules: [] }
      const errorStorage = {
        ...mockStorage,
        write: vi.fn().mockRejectedValue(new Error('Write error'))
      }
      await expect(saveProfile(errorStorage, profile)).rejects.toThrow('Write error')
    })
  })

  describe('addOrUpdateRule', () => {
    it('should add new rule', () => {
      const profile: Profile = { rules: [] }
      const newRule: PreferenceRule = {
        trigger: '简洁点',
        preference: '保持表达简洁',
        confidence: 0.6,
        updatedAt: '2026-02-28'
      }
      const result = addOrUpdateRule(profile, newRule)
      expect(result.rules).toHaveLength(1)
    })

    it('should update existing rule with same preference', () => {
      const existingRule: PreferenceRule = {
        trigger: '简洁点',
        preference: '保持表达简洁',
        confidence: 0.6,
        updatedAt: '2026-02-01'
      }
      const profile: Profile = { rules: [existingRule] }
      const newRule: PreferenceRule = {
        trigger: '太复杂',
        preference: '保持表达简洁', // 相同的preference
        confidence: 0.7,
        updatedAt: '2026-02-28'
      }
      const result = addOrUpdateRule(profile, newRule)
      expect(result.rules).toHaveLength(1)
      expect(result.rules[0].confidence).toBe(0.7) // 被更新
    })

    it('should add multiple different rules', () => {
      const profile: Profile = { rules: [] }
      const rule1: PreferenceRule = {
        trigger: '简洁点',
        preference: '保持表达简洁',
        confidence: 0.6,
        updatedAt: '2026-02-28'
      }
      const rule2: PreferenceRule = {
        trigger: '不对',
        preference: '重新理解',
        confidence: 0.7,
        updatedAt: '2026-02-28'
      }
      let result = addOrUpdateRule(profile, rule1)
      result = addOrUpdateRule(result, rule2)
      expect(result.rules).toHaveLength(2)
    })
  })

  describe('removeRule', () => {
    it('should remove rule by preference text', () => {
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.6,
          updatedAt: '2026-02-28'
        }]
      }
      const result = removeRule(profile, '保持表达简洁')
      expect(result.rules).toHaveLength(0)
    })

    it('should not affect other rules', () => {
      const profile: Profile = {
        rules: [
          {
            trigger: '简洁点',
            preference: '保持表达简洁',
            confidence: 0.6,
            updatedAt: '2026-02-28'
          },
          {
            trigger: '不对',
            preference: '重新理解',
            confidence: 0.7,
            updatedAt: '2026-02-28'
          }
        ]
      }
      const result = removeRule(profile, '保持表达简洁')
      expect(result.rules).toHaveLength(1)
      expect(result.rules[0].preference).toBe('重新理解')
    })
  })

  describe('getHighConfidencePreferences', () => {
    it('should return preferences above threshold', () => {
      const profile: Profile = {
        rules: [
          { trigger: '1', preference: 'pref1', confidence: 0.8, updatedAt: '2026-02-28' },
          { trigger: '2', preference: 'pref2', confidence: 0.4, updatedAt: '2026-02-28' },
          { trigger: '3', preference: 'pref3', confidence: 0.9, updatedAt: '2026-02-28' }
        ]
      }
      const result = getHighConfidencePreferences(profile, 0.7)
      expect(result).toHaveLength(2)
      expect(result).toContain('pref1')
      expect(result).toContain('pref3')
      expect(result).not.toContain('pref2')
    })

    it('should sort by confidence descending', () => {
      const profile: Profile = {
        rules: [
          { trigger: '1', preference: 'pref1', confidence: 0.8, updatedAt: '2026-02-28' },
          { trigger: '2', preference: 'pref2', confidence: 0.9, updatedAt: '2026-02-28' }
        ]
      }
      const result = getHighConfidencePreferences(profile)
      expect(result[0]).toBe('pref2') // 0.9 should be first
      expect(result[1]).toBe('pref1') // 0.8 should be second
    })

    it('should use default threshold of 0.5', () => {
      const profile: Profile = {
        rules: [
          { trigger: '1', preference: 'pref1', confidence: 0.6, updatedAt: '2026-02-28' },
          { trigger: '2', preference: 'pref2', confidence: 0.4, updatedAt: '2026-02-28' }
        ]
      }
      const result = getHighConfidencePreferences(profile)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('pref1')
    })
  })

  describe('decayOldPreferences', () => {
    it('should decay confidence for old rules', () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31) // 31 days ago
      
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.8,
          updatedAt: oldDate.toISOString().split('T')[0]
        }]
      }
      const result = decayOldPreferences(profile, 30)
      expect(result.rules[0].confidence).toBe(0.7) // decayed by 0.1
    })

    it('should not decay recent rules', () => {
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.8,
          updatedAt: new Date().toISOString().split('T')[0]
        }]
      }
      const result = decayOldPreferences(profile, 30)
      expect(result.rules[0].confidence).toBe(0.8)
    })

    it('should not go below MIN confidence', () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)
      
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.4,
          updatedAt: oldDate.toISOString().split('T')[0]
        }]
      }
      const result = decayOldPreferences(profile, 30)
      expect(result.rules[0].confidence).toBe(CONFIDENCE_CONFIG.MIN)
    })
  })

  describe('mergeProfiles', () => {
    it('should merge two profiles', () => {
      const base: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.6,
          updatedAt: '2026-02-28'
        }]
      }
      const incoming: Profile = {
        rules: [{
          trigger: '不对',
          preference: '重新理解',
          confidence: 0.7,
          updatedAt: '2026-02-28'
        }]
      }
      const result = mergeProfiles(base, incoming)
      expect(result.rules).toHaveLength(2)
    })

    it('should keep higher confidence for duplicate preferences', () => {
      const base: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.6,
          updatedAt: '2026-02-28'
        }]
      }
      const incoming: Profile = {
        rules: [{
          trigger: '太复杂',
          preference: '保持表达简洁', // same preference
          confidence: 0.8,
          updatedAt: '2026-02-28'
        }]
      }
      const result = mergeProfiles(base, incoming)
      expect(result.rules).toHaveLength(1)
      expect(result.rules[0].confidence).toBe(0.8)
    })
  })

  describe('exportProfile', () => {
    it('should export profile as JSON string', () => {
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.6,
          updatedAt: '2026-02-28'
        }]
      }
      const json = exportProfile(profile)
      expect(JSON.parse(json)).toEqual(profile)
    })
  })

  describe('importProfile', () => {
    it('should import valid JSON', () => {
      const profile: Profile = {
        rules: [{
          trigger: '简洁点',
          preference: '保持表达简洁',
          confidence: 0.6,
          updatedAt: '2026-02-28'
        }]
      }
      const json = JSON.stringify(profile)
      const result = importProfile(json)
      expect(result).toEqual(profile)
    })

    it('should throw for invalid JSON', () => {
      expect(() => importProfile('not valid json')).toThrow()
    })

    it('should throw for missing rules array', () => {
      const invalid = JSON.stringify({ someOtherField: [] })
      expect(() => importProfile(invalid)).toThrow('Invalid profile format')
    })
  })

  describe('getProfileStats', () => {
    it('should return stats for empty profile', () => {
      const profile: Profile = { rules: [] }
      const stats = getProfileStats(profile)
      expect(stats.totalRules).toBe(0)
      expect(stats.highConfidenceRules).toBe(0)
      expect(stats.averageConfidence).toBe(0)
      expect(stats.oldestRule).toBeNull()
      expect(stats.newestRule).toBeNull()
    })

    it('should calculate correct stats', () => {
      const profile: Profile = {
        rules: [
          { trigger: '1', preference: 'pref1', confidence: 0.8, updatedAt: '2026-02-01' },
          { trigger: '2', preference: 'pref2', confidence: 0.4, updatedAt: '2026-02-28' },
          { trigger: '3', preference: 'pref3', confidence: 0.9, updatedAt: '2026-02-15' }
        ]
      }
      const stats = getProfileStats(profile)
      expect(stats.totalRules).toBe(3)
      expect(stats.highConfidenceRules).toBe(2) // 0.8 and 0.9
      expect(stats.averageConfidence).toBe(0.7) // (0.8 + 0.4 + 0.9) / 3 = 0.7
      expect(stats.oldestRule).toBe('2026-02-01')
      expect(stats.newestRule).toBe('2026-02-28')
    })
  })
})
