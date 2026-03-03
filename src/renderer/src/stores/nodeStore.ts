import { create } from 'zustand'
import type { Node, NodePosition, Conversation } from '@shared/types'
import { STORAGE_FILES, UI_CONFIG } from '@shared/constants'
import { storageService } from '../services/storageService'

/**
 * 节点数据管理
 * 负责管理画布节点的CRUD操作和持久化
 */

interface NodeState {
  nodes: Node[]
  
  // 加载
  loadNodes: () => Promise<void>
  
  // CRUD
  addNode: (conversation: Conversation, position?: NodePosition) => Promise<void>
  removeNode: (id: string) => Promise<void>
  updateNodePosition: (id: string, position: NodePosition) => Promise<void>
  
  // 查询
  getNodeById: (id: string) => Node | undefined
  getNodeByConversationId: (conversationId: string) => Node | undefined
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],

  loadNodes: async () => {
    try {
      const content = await storageService.read(STORAGE_FILES.NODES)
      if (content) {
        const nodes = JSON.parse(content) as Node[]
        set({ nodes })
      }
    } catch (error) {
      console.error('Failed to load nodes:', error)
    }
  },

  addNode: async (conversation: Conversation, position?: NodePosition) => {
    const { nodes } = get()
    
    // 生成标题
    const title = conversation.userMessage.slice(0, UI_CONFIG.NODE_TITLE_MAX_LENGTH)
    
    // 生成关键词
    const keywords = conversation.assistantMessage
      .split(/[\s,，.。!！?？;；]+/)
      .filter(word => word.length >= 2 && word.length <= 6)
      .slice(0, UI_CONFIG.NODE_KEYWORDS_COUNT)
    
    // 计算位置
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
    
    await storageService.write(
      STORAGE_FILES.NODES,
      JSON.stringify(updatedNodes, null, 2)
    )
  },

  removeNode: async (id: string) => {
    const { nodes } = get()
    const updatedNodes = nodes.filter(n => n.id !== id)
    set({ nodes: updatedNodes })
    await storageService.write(
      STORAGE_FILES.NODES,
      JSON.stringify(updatedNodes, null, 2)
    )
  },

  updateNodePosition: async (id: string, position: NodePosition) => {
    const { nodes } = get()
    const updatedNodes = nodes.map(n => 
      n.id === id ? { ...n, x: position.x, y: position.y } : n
    )
    set({ nodes: updatedNodes })
    // 位置变化暂不持久化，后续批量处理
  },

  getNodeById: (id: string) => {
    return get().nodes.find(n => n.id === id)
  },

  getNodeByConversationId: (conversationId: string) => {
    return get().nodes.find(n => n.conversationId === conversationId)
  }
}))
