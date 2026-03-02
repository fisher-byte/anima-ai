import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, Sparkles, X, Calendar, MessageSquare, BrainCircuit } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Conversation } from '@shared/types'

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ConversationSidebar({ isOpen, onClose }: ConversationSidebarProps) {
  const { nodes, profile, openModalById, focusNode } = useCanvasStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'evolution'>('history')
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
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 text-sm font-semibold transition-colors ${activeTab === 'history' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <History className="w-4 h-4" />
              对话历史
            </button>
            <button
              onClick={() => setActiveTab('evolution')}
              className={`flex items-center gap-2 text-sm font-semibold transition-colors ${activeTab === 'evolution' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              进化日志
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {activeTab === 'history' ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-3"
              >
                {isLoading ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                    加载中...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 space-y-2">
                    <MessageSquare className="w-8 h-8 mx-auto opacity-20" />
                    <p className="text-xs">暂无对话记录</p>
                  </div>
                ) : (
                  conversations
                    .filter(conv => nodes.some(n => n.conversationId === conv.id))
                    .map((conversation) => {
                      const node = findNodeForConversation(conversation.id)
                      return (
                        <div
                          key={conversation.id}
                          onClick={() => handleConversationClick(conversation)}
                          className="p-4 bg-gray-50/50 hover:bg-gray-100/80 border border-gray-100/50 rounded-2xl cursor-pointer transition-all group relative overflow-hidden"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-medium text-gray-800 text-sm line-clamp-1 flex-1">
                              {node?.title || conversation.userMessage.slice(0, 20)}
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">
                              {conversation.createdAt.split('T')[0]}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed opacity-80">
                            {conversation.assistantMessage.replace(/#\d+\n用户：.*\nAI：/, '').slice(0, 80)}...
                          </div>

                          {conversation.appliedPreferences && conversation.appliedPreferences.length > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">
                              <Sparkles className="w-3 h-3" />
                              <span>已应用 {conversation.appliedPreferences.length} 条记忆</span>
                            </div>
                          )}
                        </div>
                      )
                    })
                )}
              </motion.div>
            ) : (
              <motion.div
                key="evolution"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="p-4 bg-blue-50/30 border border-blue-100/50 rounded-2xl">
                  <h3 className="text-xs font-bold text-blue-600 mb-1 flex items-center gap-2">
                    <BrainCircuit className="w-3.5 h-3.5" />
                    自进化状态
                  </h3>
                  <p className="text-[10px] text-blue-500/80 leading-relaxed">
                    AI 正在通过你的对话纠错和反馈，在本地静默构建专属的“表达与逻辑规则库”。
                  </p>
                </div>

                <div className="space-y-3">
                  {profile.rules.length === 0 ? (
                    <div className="text-center text-gray-400 py-12 space-y-2">
                      <Sparkles className="w-8 h-8 mx-auto opacity-20" />
                      <p className="text-xs">尚未习得任何偏好</p>
                    </div>
                  ) : (
                    profile.rules
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((rule, idx) => (
                        <div key={idx} className="p-4 bg-gray-50/50 border border-gray-100 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              记忆强度 {(rule.confidence * 100).toFixed(0)}%
                            </span>
                            <button
                              onClick={async () => {
                                if (confirm('确定要遗忘这条偏好吗？')) {
                                  // This requires a new store action, for now we just filter locally to show intent
                                  // In real impl, add removePreference to store
                                }
                              }}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                             <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${rule.confidence * 100}%` }}
                                  className={`h-full rounded-full ${rule.confidence > 0.8 ? 'bg-green-400' : rule.confidence > 0.5 ? 'bg-blue-400' : 'bg-gray-300'}`}
                                />
                             </div>
                          </div>
                          <div className="text-xs text-gray-800 font-medium leading-relaxed">
                            {rule.preference}
                          </div>
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            最后活跃：{rule.updatedAt}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* 底部统计 */}
        <div className="p-5 border-t border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-widest flex justify-between">
          <span>Total Nodes: {nodes.length}</span>
          <span>Rules: {profile.rules.length}</span>
        </div>
      </motion.div>
    </>
  )
}
