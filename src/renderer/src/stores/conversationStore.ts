import { create } from 'zustand'
import type { Conversation } from '@shared/types'
import { STORAGE_FILES } from '@shared/constants'

/**
 * 对话管理
 * 负责管理当前对话状态和对话历史记录
 */

interface ConversationState {
  currentConversation: Conversation | null
  
  // 对话生命周期
  startConversation: (userMessage: string) => void
  endConversation: (assistantMessage: string, appliedPreferences?: string[]) => Promise<void>
  setCurrentConversation: (conversation: Conversation | null) => void
  
  // 存储
  appendConversation: (conversation: Conversation) => Promise<void>
  loadConversationHistory: () => Promise<Conversation[]>
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  currentConversation: null,

  startConversation: (userMessage: string) => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userMessage,
      assistantMessage: ''
    }
    set({ currentConversation: conversation })
  },

  endConversation: async (assistantMessage: string, appliedPreferences?: string[]) => {
    const { currentConversation } = get()
    if (!currentConversation) return
    
    const updatedConversation: Conversation = {
      ...currentConversation,
      assistantMessage,
      appliedPreferences
    }
    
    set({ currentConversation: updatedConversation })
    await get().appendConversation(updatedConversation)
  },

  setCurrentConversation: (conversation) => {
    set({ currentConversation: conversation })
  },

  appendConversation: async (conversation: Conversation) => {
    await window.electronAPI.storage.append(
      STORAGE_FILES.CONVERSATIONS,
      JSON.stringify(conversation)
    )
  },

  loadConversationHistory: async () => {
    try {
      const content = await window.electronAPI.storage.read(STORAGE_FILES.CONVERSATIONS)
      if (!content) return []
      
      const lines = content.trim().split('\n').filter(Boolean)
      return lines
        .map(line => {
          try {
            return JSON.parse(line) as Conversation
          } catch {
            return null
          }
        })
        .filter((c): c is Conversation => c !== null)
        .reverse()
    } catch (error) {
      console.error('Failed to load conversation history:', error)
      return []
    }
  }
}))
