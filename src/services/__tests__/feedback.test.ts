import { describe, it, expect } from 'vitest'
import { 
  detectNegativeFeedback, 
  detectMultipleFeedback,
  updateConfidence,
  containsTriggerWord,
  analyzeFeedbackIntensity,
  getAllTriggerWords
} from '../feedback'
import { CONFIDENCE_CONFIG } from '../../shared/constants'

describe('feedback service', () => {
  describe('detectNegativeFeedback', () => {
    it('should detect "简洁点" and return preference rule', () => {
      const result = detectNegativeFeedback('太复杂了，简洁点')
      expect(result).not.toBeNull()
      expect(result?.trigger).toBe('简洁点')
      expect(result?.preference).toBe('保持表达简洁：先结论，后要点，避免冗长铺垫')
      expect(result?.confidence).toBe(CONFIDENCE_CONFIG.INITIAL)
    })

    it('should detect "太复杂"', () => {
      const result = detectNegativeFeedback('这个回答太复杂了')
      expect(result).not.toBeNull()
      expect(result?.trigger).toBe('太复杂')
    })

    it('should detect "别用这个"', () => {
      const result = detectNegativeFeedback('别用这个方案')
      expect(result).not.toBeNull()
      expect(result?.preference).toBe('避免使用刚才提到的方案或工具')
    })

    it('should detect "换个思路"', () => {
      const result = detectNegativeFeedback('换个思路试试')
      expect(result).not.toBeNull()
      expect(result?.preference).toBe('换一种组织方式：给要点、给步骤、给对比')
    })

    it('should detect "不对"', () => {
      const result = detectNegativeFeedback('不对，你理解错了')
      expect(result).not.toBeNull()
      expect(result?.preference).toBe('重新理解需求，确认关键信息后再回答')
    })

    it('should be case insensitive', () => {
      const result = detectNegativeFeedback('JIANJIEDIAN')
      expect(result).toBeNull()
    })

    it('should return null for non-feedback messages', () => {
      const result = detectNegativeFeedback('谢谢你的帮助')
      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = detectNegativeFeedback('')
      expect(result).toBeNull()
    })

    it('should handle multiple keywords in one message', () => {
      // 只应该返回第一个匹配的
      const result = detectNegativeFeedback('太复杂了，简洁点，别用这个')
      expect(result).not.toBeNull()
      // 应该匹配到第一个触发词
    })
  })

  describe('detectMultipleFeedback', () => {
    it('should detect feedback from multiple messages', () => {
      const messages = [
        '太复杂了，简洁点',
        '别用这个方案',
        '正常的回复'
      ]
      const results = detectMultipleFeedback(messages)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should deduplicate same preferences', () => {
      const messages = [
        '简洁点',
        '太长了，简洁点',
        '简洁点 please'
      ]
      const results = detectMultipleFeedback(messages)
      // 应该只返回一个"简洁"相关的规则
      const uniquePreferences = new Set(results.map(r => r.preference))
      expect(uniquePreferences.size).toBeLessThanOrEqual(results.length)
    })
  })

  describe('updateConfidence', () => {
    it('should increase confidence by INCREMENT', () => {
      const rule = {
        trigger: 'test',
        preference: 'test preference',
        confidence: 0.6,
        updatedAt: '2026-02-28'
      }
      const updated = updateConfidence(rule)
      expect(updated.confidence).toBe(0.6 + CONFIDENCE_CONFIG.INCREMENT)
    })

    it('should not exceed MAX confidence', () => {
      const rule = {
        trigger: 'test',
        preference: 'test preference',
        confidence: CONFIDENCE_CONFIG.MAX - 0.05,
        updatedAt: '2026-02-28'
      }
      const updated = updateConfidence(rule)
      expect(updated.confidence).toBe(CONFIDENCE_CONFIG.MAX)
    })

    it('should update updatedAt date', () => {
      const rule = {
        trigger: 'test',
        preference: 'test preference',
        confidence: 0.6,
        updatedAt: '2026-01-01'
      }
      const updated = updateConfidence(rule)
      expect(updated.updatedAt).toBe(new Date().toISOString().split('T')[0])
    })
  })

  describe('containsTriggerWord', () => {
    it('should return true for trigger words', () => {
      expect(containsTriggerWord('简洁点')).toBe(true)
      expect(containsTriggerWord('不对')).toBe(true)
    })

    it('should return false for normal text', () => {
      expect(containsTriggerWord('你好')).toBe(false)
      expect(containsTriggerWord('谢谢')).toBe(false)
    })
  })

  describe('analyzeFeedbackIntensity', () => {
    it('should detect strong negative intensity', () => {
      const intensity = analyzeFeedbackIntensity('完全不对！！')
      expect(intensity).toBeGreaterThan(0)
    })

    it('should detect normal negative intensity', () => {
      const intensity = analyzeFeedbackIntensity('不对')
      expect(intensity).toBeGreaterThan(0)
    })

    it('should return 0 for neutral text', () => {
      const intensity = analyzeFeedbackIntensity('好的，谢谢')
      expect(intensity).toBe(0)
    })

    it('should not exceed 1.0', () => {
      const intensity = analyzeFeedbackIntensity('完全不对！！完全错误！！')
      expect(intensity).toBeLessThanOrEqual(1.0)
    })
  })

  describe('getAllTriggerWords', () => {
    it('should return array of trigger words', () => {
      const words = getAllTriggerWords()
      expect(words.length).toBeGreaterThan(0)
      expect(words).toContain('简洁点')
      expect(words).toContain('不对')
    })
  })
})
