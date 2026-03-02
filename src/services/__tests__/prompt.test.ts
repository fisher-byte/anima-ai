import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  buildMessages,
  detectPreferenceApplication,
  detectAppliedPreferences,
  generateGrayHint,
  filterValidPreferences,
  formatConversationHistory,
  generateTitlePrompt,
  generateKeywordsPrompt
} from '../prompt'
import { DEFAULT_SYSTEM_PROMPT } from '../../shared/constants'
import type { PreferenceRule, AIMessage } from '../../shared/types'

describe('prompt service', () => {
  describe('buildSystemPrompt', () => {
    it('should return default prompt when no preferences', () => {
      const prompt = buildSystemPrompt([])
      // 基础 prompt 内容包含在结果中（函数会额外追加当前日期）
      expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT)
      // 验证日期注入存在
      expect(prompt).toMatch(/当前日期：\d{4}年/)
    })

    it('should include preferences in prompt', () => {
      const preferences = ['保持表达简洁', '避免emoji']
      const prompt = buildSystemPrompt(preferences)
      expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT)
      expect(prompt).toContain('保持表达简洁')
      expect(prompt).toContain('避免emoji')
      expect(prompt).toContain('1.')
      expect(prompt).toContain('2.')
    })

    it('should not include preference explanation instruction', () => {
      const preferences = ['保持表达简洁']
      const prompt = buildSystemPrompt(preferences)
      expect(prompt).toContain('不要在你的回答中提及这些偏好规则')
    })
  })

  describe('buildMessages', () => {
    it('should build messages with system and user', () => {
      const messages = buildMessages('你好', ['保持表达简洁'])
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('system')
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toBe('你好')
    })

    it('should include preferences in system message', () => {
      const messages = buildMessages('你好', ['保持表达简洁'])
      expect(messages[0].content).toContain('保持表达简洁')
    })
  })

  describe('detectPreferenceApplication', () => {
    it('should detect concise preference from short response', () => {
      const rule: PreferenceRule = {
        trigger: '简洁点',
        preference: '保持表达简洁：先结论，后要点，避免冗长铺垫',
        confidence: 0.8,
        updatedAt: '2026-02-28'
      }
      const response = '结论：这样做最好。要点：1. 简单 2. 高效'
      expect(detectPreferenceApplication(response, rule)).toBe(true)
    })

    it('should not detect concise preference from long response', () => {
      const rule: PreferenceRule = {
        trigger: '简洁点',
        preference: '保持表达简洁',
        confidence: 0.8,
        updatedAt: '2026-02-28'
      }
      const response = 'a'.repeat(250) // long response
      expect(detectPreferenceApplication(response, rule)).toBe(false)
    })

    it('should detect structured preference', () => {
      const rule: PreferenceRule = {
        trigger: '换个思路',
        preference: '换一种组织方式：给要点、给步骤、给对比',
        confidence: 0.8,
        updatedAt: '2026-02-28'
      }
      const response = '1. 第一步\n2. 第二步\n3. 第三步'
      expect(detectPreferenceApplication(response, rule)).toBe(true)
    })

    it('should return false for avoid preference (cannot detect)', () => {
      const rule: PreferenceRule = {
        trigger: '别用这个',
        preference: '避免使用刚才提到的方案或工具',
        confidence: 0.8,
        updatedAt: '2026-02-28'
      }
      const response = '任何回答'
      expect(detectPreferenceApplication(response, rule)).toBe(false)
    })
  })

  describe('detectAppliedPreferences', () => {
    it('should detect multiple applied preferences', () => {
      const rules: PreferenceRule[] = [
        { trigger: '简洁点', preference: '保持表达简洁', confidence: 0.8, updatedAt: '2026-02-28' },
        { trigger: '不对', preference: '重新理解', confidence: 0.7, updatedAt: '2026-02-28' }
      ]
      const response = '结论：答案。1. 要点' // short and structured
      const applied = detectAppliedPreferences(response, rules)
      expect(applied.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('generateGrayHint', () => {
    it('should return empty for no preferences', () => {
      const hint = generateGrayHint([])
      expect(hint).toBe('')
    })

    it('should generate hint for single preference', () => {
      const hint = generateGrayHint(['保持表达简洁'])
      expect(hint).toContain('简洁表达')
      expect(hint).toContain('我记得你上次更喜欢')
    })

    it('should generate hint for multiple preferences', () => {
      const hint = generateGrayHint(['保持表达简洁', '换一种组织方式'])
      expect(hint).toContain('我记得你上次更喜欢')
      expect(hint).toContain('和')
    })

    it('should simplify preference descriptions', () => {
      const hint = generateGrayHint(['避免使用刚才提到的方案或工具'])
      expect(hint).toContain('避免特定内容')
    })
  })

  describe('filterValidPreferences', () => {
    it('should filter by confidence threshold', () => {
      const rules: PreferenceRule[] = [
        { trigger: '1', preference: 'pref1', confidence: 0.8, updatedAt: '2026-02-28' },
        { trigger: '2', preference: 'pref2', confidence: 0.4, updatedAt: '2026-02-28' },
        { trigger: '3', preference: 'pref3', confidence: 0.9, updatedAt: '2026-02-28' }
      ]
      const result = filterValidPreferences(rules, 0.7)
      expect(result).toHaveLength(2)
      expect(result).toContain('pref1')
      expect(result).toContain('pref3')
    })

    it('should sort by confidence descending', () => {
      const rules: PreferenceRule[] = [
        { trigger: '1', preference: 'pref1', confidence: 0.8, updatedAt: '2026-02-28' },
        { trigger: '2', preference: 'pref2', confidence: 0.9, updatedAt: '2026-02-28' }
      ]
      const result = filterValidPreferences(rules, 0.7)
      expect(result[0]).toBe('pref2')
      expect(result[1]).toBe('pref1')
    })
  })

  describe('formatConversationHistory', () => {
    it('should format messages correctly', () => {
      const history: AIMessage[] = [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ]
      const formatted = formatConversationHistory(history)
      expect(formatted).not.toContain('system') // should skip system
      expect(formatted).toContain('用户：hello')
      expect(formatted).toContain('AI：hi there')
    })

    it('should handle empty history', () => {
      const formatted = formatConversationHistory([])
      expect(formatted).toBe('')
    })
  })

  describe('generateTitlePrompt', () => {
    it('should include user message and assistant response', () => {
      const prompt = generateTitlePrompt('What is React?', 'React is a library...')
      expect(prompt).toContain('What is React?')
      expect(prompt).toContain('React is a library')
      expect(prompt).toContain('不超过8个字')
    })

    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(200)
      const prompt = generateTitlePrompt(longMessage, 'b'.repeat(200))
      expect(prompt.length).toBeLessThan(500) // truncated
    })
  })

  describe('generateKeywordsPrompt', () => {
    it('should request 2-3 keywords', () => {
      const prompt = generateKeywordsPrompt('some content')
      expect(prompt).toContain('2-3个关键词')
    })

    it('should include content', () => {
      const content = 'JavaScript programming tutorial'
      const prompt = generateKeywordsPrompt(content)
      expect(prompt).toContain(content)
    })

    it('should truncate long content', () => {
      const longContent = 'a'.repeat(500)
      const prompt = generateKeywordsPrompt(longContent)
      expect(prompt.length).toBeLessThan(400) // truncated to 300 + prompt
    })
  })
})
