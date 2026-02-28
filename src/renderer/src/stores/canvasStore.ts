import { create } from 'zustand'
import type { Node, Conversation, Profile, PreferenceRule, NodePosition } from '@shared/types'
import { STORAGE_FILES, FEEDBACK_TRIGGERS, CONFIDENCE_CONFIG, UI_CONFIG } from '@shared/constants'

interface CanvasState {
  // 数据
  nodes: Node[]
  currentConversation: Conversation | null
  profile: Profile
  isModalOpen: boolean
  isLoading: boolean
  
  // 方法：数据加载
  loadNodes: () => Promise<void>
  loadProfile: () => Promise<void>
  
  // 方法：节点操作
  addNode: (conversation: Conversation, position?: NodePosition) => Promise<void>
  removeNode: (id: string) => Promise<void>
  
  // 方法：对话
  startConversation: (userMessage: string) => void
  endConversation: (assistantMessage: string, appliedPreferences?: string[]) => Promise<void>
  closeModal: () => void
  openModal: (conversation: Conversation) => void
  
  // 方法：偏好学习
  detectFeedback: (message: string) => PreferenceRule | null
  addPreference: (rule: PreferenceRule) => Promise<void>
  getPreferencesForPrompt: () => string[]
  
  // 方法：对话记录
  appendConversation: (conversation: Conversation) => Promise<void>
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  currentConversation: null,
  profile: { rules: [] },
  isModalOpen: false,
  isLoading: false,

  // 加载节点数据
  loadNodes: async () => {
    try {
      const content = await window.electronAPI.storage.read(STORAGE_FILES.NODES)
      if (content) {
        const nodes = JSON.parse(content) as Node[]
        set({ nodes })
      }
    } catch (error) {
      console.error('Failed to load nodes:', error)
    }
  },

  // 加载用户偏好
  loadProfile: async () => {
    try {
      const content = await window.electronAPI.storage.read(STORAGE_FILES.PROFILE)
      if (content) {
        const profile = JSON.parse(content) as Profile
        set({ profile })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  },

  // 添加节点
  addNode: async (conversation: Conversation, position?: NodePosition) => {
    const { nodes } = get()
    
    // 生成标题（从用户消息提取前8个字符）
    const title = conversation.userMessage.slice(0, UI_CONFIG.NODE_TITLE_MAX_LENGTH)
    
    // 生成关键词（简单实现：从AI回答中提取前3个有意义的词）
    const keywords = conversation.assistantMessage
      .split(/[\s,，.。!！?？;；]+/)
      .filter(word => word.length >= 2 && word.length <= 6)
      .slice(0, UI_CONFIG.NODE_KEYWORDS_COUNT)
    
    // 计算位置（如果未指定，随机分布在画布中央区域）
    const x = position?.x ?? 100 + Math.random() * 200
    const y = position?.y ?? 100 + Math.random() * 200
    
    const newNode: Node = {
      id: conversation.id,
      title,
      keywords,
      date: new Date().toISOString().split('T')[0],
      conversationId: conversation.id,
      x,
      y
    }
    
    const updatedNodes = [...nodes, newNode]
    set({ nodes: updatedNodes })
    
    // 持久化
    await window.electronAPI.storage.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  // 删除节点
  removeNode: async (id: string) => {
    const { nodes } = get()
    const updatedNodes = nodes.filter(n => n.id !== id)
    set({ nodes: updatedNodes })
    await window.electronAPI.storage.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  // 开始对话
  startConversation: (userMessage: string) => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userMessage,
      assistantMessage: ''
    }
    set({ currentConversation: conversation, isModalOpen: true, isLoading: true })
  },

  // 结束对话
  endConversation: async (assistantMessage: string, appliedPreferences?: string[]) => {
    const { currentConversation, addNode, appendConversation } = get()
    if (!currentConversation) return
    
    const updatedConversation: Conversation = {
      ...currentConversation,
      assistantMessage,
      appliedPreferences
    }
    
    set({
      currentConversation: updatedConversation,
      isLoading: false
    })

    try {
      // 记录对话
      await appendConversation(updatedConversation)
      // 创建节点
      await addNode(updatedConversation)
    } catch (error) {
      console.error('保存对话或节点失败:', error)
      // TODO: 添加 UI 反馈（如 toast 通知）告知用户保存失败
      // 暂时静默处理，避免阻塞用户操作流程
    }
  },

  // 关闭模态框
  closeModal: () => {
    set({ isModalOpen: false, currentConversation: null })
  },

  // 打开模态框（用于回放）
  openModal: (conversation: Conversation) => {
    set({ currentConversation: conversation, isModalOpen: true })
  },

  // 检测负反馈
  detectFeedback: (message: string): PreferenceRule | null => {
    for (const trigger of FEEDBACK_TRIGGERS) {
      for (const keyword of trigger.keywords) {
        if (message.includes(keyword)) {
          // 检查是否已存在相同偏好的规则
          const { profile } = get()
          const existingRule = profile.rules.find(r => r.preference === trigger.preference)
          
          if (existingRule) {
            // 更新现有规则的置信度
            existingRule.confidence = Math.min(
              existingRule.confidence + CONFIDENCE_CONFIG.INCREMENT,
              CONFIDENCE_CONFIG.MAX
            )
            existingRule.updatedAt = new Date().toISOString().split('T')[0]
            return existingRule
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

  // 添加偏好规则
  addPreference: async (newRule: PreferenceRule) => {
    const { profile } = get()
    
    // 检查是否已存在相同偏好的规则
    const existingIndex = profile.rules.findIndex(r => r.preference === newRule.preference)
    
    let updatedRules: PreferenceRule[]
    if (existingIndex >= 0) {
      // 更新现有规则
      updatedRules = [...profile.rules]
      updatedRules[existingIndex] = newRule
    } else {
      // 添加新规则
      updatedRules = [...profile.rules, newRule]
    }
    
    const updatedProfile = { ...profile, rules: updatedRules }
    set({ profile: updatedProfile })
    
    // 持久化
    await window.electronAPI.storage.write(
      STORAGE_FILES.PROFILE, 
      JSON.stringify(updatedProfile, null, 2)
    )
  },

  // 获取用于Prompt的偏好列表
  getPreferencesForPrompt: (): string[] => {
    const { profile } = get()
    // 只返回置信度较高的偏好（> 0.5）
    return profile.rules
      .filter(r => r.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .map(r => r.preference)
  },

  // 追加对话记录
  appendConversation: async (conversation: Conversation) => {
    await window.electronAPI.storage.append(
      STORAGE_FILES.CONVERSATIONS,
      JSON.stringify(conversation)
    )
  }
}))
