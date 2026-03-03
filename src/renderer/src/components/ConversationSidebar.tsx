import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History, Sparkles, X, Calendar, MessageSquare, BrainCircuit,
  User, MapPin, Briefcase, Wrench, Target, Heart, BookOpen, Trash2
} from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Conversation } from '@shared/types'
import { storageService } from '../services/storageService'

interface UserProfile {
  occupation?: string | null
  interests?: string[]
  tools?: string[]
  writingStyle?: string | null
  goals?: string[]
  location?: string | null
  lastExtracted?: string | null
  updatedAt?: string
}

interface MemoryFact {
  id: string
  fact: string
  source_conv_id: string | null
  created_at: string
}

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ConversationSidebar({ isOpen, onClose }: ConversationSidebarProps) {
  const { nodes, profile, openModalById, focusNode, removePreference } = useCanvasStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'memory' | 'evolution'>('history')
  const [isLoading, setIsLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)

  // 加载对话历史
  useEffect(() => {
    if (!isOpen) return
    const loadConversations = async () => {
      setIsLoading(true)
      try {
        const content = await storageService.read('conversations.jsonl')
        if (content) {
          const lines = content.trim().split('\n').filter(Boolean)
          const idMap = new Map<string, Conversation>()
          lines.forEach(line => {
            try {
              const conv = JSON.parse(line) as Conversation
              if (conv.id) idMap.set(conv.id, conv)
            } catch {}
          })
          setConversations(Array.from(idMap.values()).reverse())
        }
      } catch (error) {
        console.error('Failed to load conversations:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadConversations()
  }, [isOpen])

  // 加载用户画像
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/memory/profile')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUserProfile(data) })
      .catch(() => {})
  }, [isOpen])

  // 加载记忆事实（每次切到 memory tab 时刷新）
  useEffect(() => {
    if (!isOpen || activeTab !== 'memory') return
    setIsMemoryLoading(true)
    fetch('/api/memory/facts')
      .then(r => r.ok ? r.json() : { facts: [] })
      .then(data => setMemoryFacts(data.facts || []))
      .catch(() => setMemoryFacts([]))
      .finally(() => setIsMemoryLoading(false))
  }, [isOpen, activeTab])

  const handleDeleteFact = useCallback(async (id: string) => {
    try {
      await fetch(`/api/memory/facts/${id}`, { method: 'DELETE' })
      setMemoryFacts(prev => prev.filter(f => f.id !== id))
    } catch {}
  }, [])

  const findNodeForConversation = useCallback((conversationId: string) => {
    return nodes.find(n => n.conversationId === conversationId)
  }, [nodes])

  const handleConversationClick = useCallback((conversation: Conversation) => {
    onClose()
    openModalById(conversation.id)
    focusNode(conversation.id)
  }, [onClose, openModalById, focusNode])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* 头部：三个 Tab */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${activeTab === 'history' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <History className="w-3.5 h-3.5" />
              历史
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className={`flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${activeTab === 'memory' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              记忆
            </button>
            <button
              onClick={() => setActiveTab('evolution')}
              className={`flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${activeTab === 'evolution' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              进化基因
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
            {/* ── 对话历史 Tab ── */}
            {activeTab === 'history' && (
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
            )}

            {/* ── 记忆板块 Tab（独立，与进化基因同级） ── */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="p-4 bg-purple-50/30 border border-purple-100/50 rounded-2xl">
                  <h3 className="text-xs font-bold text-purple-600 mb-1 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    关于你的记忆
                  </h3>
                  <p className="text-[10px] text-purple-500/80 leading-relaxed">
                    AI 从每次对话中自动摘取你透露的信息，在这里积累成你的专属记忆。
                  </p>
                </div>

                {isMemoryLoading ? (
                  <div className="text-center text-gray-400 py-8">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-purple-400 rounded-full animate-spin mx-auto mb-2" />
                    <span className="text-xs">正在加载…</span>
                  </div>
                ) : memoryFacts.length === 0 ? (
                  <div className="text-center text-gray-400 py-12 space-y-2">
                    <BookOpen className="w-8 h-8 mx-auto opacity-20" />
                    <p className="text-xs">暂无记忆条目</p>
                    <p className="text-[10px] opacity-60">多聊几次，记忆会自动积累</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memoryFacts.map(fact => (
                      <motion.div
                        key={fact.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-start gap-2 p-3 bg-gray-50/70 border border-gray-100 rounded-2xl group"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-300 flex-shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-gray-800 leading-relaxed">{fact.fact}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {fact.created_at.split('T')[0]}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteFact(fact.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50"
                          title="删除这条记忆"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── 进化基因 Tab ── */}
            {activeTab === 'evolution' && (
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
                    AI 正在通过你的对话纠错和反馈，在本地静默构建专属的"表达与逻辑规则库"。
                  </p>
                </div>

                {/* 用户画像区块 */}
                {userProfile && (
                  userProfile.occupation != null ||
                  (userProfile.interests?.length ?? 0) > 0 ||
                  (userProfile.tools?.length ?? 0) > 0 ||
                  (userProfile.goals?.length ?? 0) > 0
                ) && (
                  <div className="p-4 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">用户画像</span>
                    </div>
                    <div className="space-y-2">
                      {userProfile.occupation && (
                        <div className="flex items-start gap-2">
                          <Briefcase className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="text-[11px] text-gray-700">{userProfile.occupation}</span>
                        </div>
                      )}
                      {userProfile.location && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="text-[11px] text-gray-700">{userProfile.location}</span>
                        </div>
                      )}
                      {(userProfile.interests?.length ?? 0) > 0 && (
                        <div className="flex items-start gap-2">
                          <Heart className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {userProfile.interests!.map((item, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-md text-[10px] font-medium">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {(userProfile.tools?.length ?? 0) > 0 && (
                        <div className="flex items-start gap-2">
                          <Wrench className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {userProfile.tools!.map((item, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[10px] font-medium">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {(userProfile.goals?.length ?? 0) > 0 && (
                        <div className="flex items-start gap-2">
                          <Target className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {userProfile.goals!.map((item, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded-md text-[10px] font-medium">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {userProfile.writingStyle && (
                        <div className="mt-1 text-[10px] text-gray-400 italic">回答风格：{userProfile.writingStyle}</div>
                      )}
                    </div>
                    {userProfile.lastExtracted && (
                      <div className="text-[10px] text-gray-300 flex items-center gap-1 pt-1 border-t border-gray-100">
                        <Calendar className="w-2.5 h-2.5" />
                        最近更新：{userProfile.lastExtracted.split('T')[0]}
                      </div>
                    )}
                  </div>
                )}

                {/* 偏好规则列表 */}
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
                                  await removePreference(idx)
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
          <span>Nodes: {nodes.length}</span>
          <span>Memory: {memoryFacts.length}</span>
          <span>Rules: {profile.rules.length}</span>
        </div>
      </motion.div>
    </>
  )
}
