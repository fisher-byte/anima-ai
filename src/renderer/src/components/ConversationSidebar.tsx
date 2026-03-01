import { useState, useEffect, useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Conversation } from '@shared/types'

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ConversationSidebar({ isOpen, onClose }: ConversationSidebarProps) {
  const { nodes, openModalById, focusNode } = useCanvasStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 加载对话历史
  useEffect(() => {
    if (!isOpen) return
    
    const loadConversations = async () => {
      setIsLoading(true)
      try {
        const content = await window.electronAPI.storage.read('conversations.jsonl')
        if (content) {
          const lines = content.trim().split('\n').filter(Boolean)
          const idMap = new Map<string, Conversation>()
          
          lines.forEach(line => {
            try {
              const conv = JSON.parse(line) as Conversation
              if (conv.id) {
                idMap.set(conv.id, conv) // 后面的记录会覆盖前面的，即保留最新状态
              }
            } catch {
              // ignore invalid line
            }
          })

          const parsed = Array.from(idMap.values()).reverse() // 最新的在前
          setConversations(parsed)
        }
      } catch (error) {
        console.error('Failed to load conversations:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadConversations()
  }, [isOpen])

  // 查找对话对应的节点
  const findNodeForConversation = useCallback((conversationId: string) => {
    return nodes.find(n => n.conversationId === conversationId)
  }, [nodes])

  // 点击对话打开回放
  const handleConversationClick = useCallback((conversation: Conversation) => {
    onClose() // 关闭侧边栏
    openModalById(conversation.id)
    focusNode(conversation.id)
  }, [onClose, openModalById, focusNode])

  if (!isOpen) return null

  return (
    <>
      {/* 遮罩层 */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      
      {/* 侧边栏 */}
      <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col animate-slide-in">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">对话历史</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        {/* 对话列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
              加载中...
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              暂无对话记录
            </div>
          ) : (
            conversations
              // 过滤掉那些没有对应节点的“孤儿对话”，确保两边数量匹配
              .filter(conv => nodes.some(n => n.conversationId === conv.id))
              .map((conversation) => {
                const node = findNodeForConversation(conversation.id)
              return (
                <div
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors group"
                >
                  {/* 标题 */}
                  <div className="font-medium text-gray-800 text-sm mb-1 line-clamp-2">
                    {node?.title || conversation.userMessage.slice(0, 20)}
                  </div>
                  
                  {/* 预览 */}
                  <div className="text-xs text-gray-500 line-clamp-2 mb-2">
                    {conversation.assistantMessage.slice(0, 60)}...
                  </div>
                  
                  {/* 元信息 */}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{conversation.createdAt.split('T')[0]}</span>
                    {conversation.appliedPreferences && conversation.appliedPreferences.length > 0 && (
                      <span className="text-green-600">✓ 应用了偏好</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
        
        {/* 底部统计 */}
        <div className="p-4 border-t border-gray-100 text-xs text-gray-500">
          共 {conversations.filter(c => nodes.some(n => n.conversationId === c.id)).length} 条对话
        </div>
      </div>
    </>
  )
}
