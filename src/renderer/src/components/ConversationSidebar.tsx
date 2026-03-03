import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History, Sparkles, X, Calendar, MessageSquare, BrainCircuit,
  User, MapPin, Briefcase, Wrench, Target, Heart, BookOpen, Trash2,
  Pencil, Check, RotateCcw
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
  const { nodes, profile, openModalById, focusNode, removePreference, clearAllForOnboarding } = useCanvasStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'memory' | 'evolution'>('history')
  const [isLoading, setIsLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editProfileDraft, setEditProfileDraft] = useState<UserProfile>({})

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

  const handleStartEditProfile = useCallback(() => {
    if (!userProfile) return
    setEditProfileDraft({
      occupation: userProfile.occupation ?? '',
      location: userProfile.location ?? '',
      writingStyle: userProfile.writingStyle ?? '',
      interests: userProfile.interests ?? [],
      tools: userProfile.tools ?? [],
      goals: userProfile.goals ?? [],
    })
    setIsEditingProfile(true)
  }, [userProfile])

  const handleSaveProfile = useCallback(async () => {
    try {
      const payload = {
        occupation: editProfileDraft.occupation || null,
        location: editProfileDraft.location || null,
        writingStyle: editProfileDraft.writingStyle || null,
        interests: editProfileDraft.interests ?? [],
        tools: editProfileDraft.tools ?? [],
        goals: editProfileDraft.goals ?? [],
      }
      const resp = await fetch('/api/memory/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (resp.ok) {
        // 后端 PUT /profile 返回 { ok: true }，这里重新拉取最新画像以刷新 UI
        const latest = await fetch('/api/memory/profile')
        if (latest.ok) {
          const data = await latest.json()
          setUserProfile(data)
        }
      }
    } catch {}
    setIsEditingProfile(false)
  }, [editProfileDraft])

  const handleCancelEditProfile = useCallback(() => {
    setIsEditingProfile(false)
    setEditProfileDraft({})
  }, [])

  const parseArrField = (val: string): string[] =>
    val.split(',').map(s => s.trim()).filter(Boolean)

  if (!isOpen) return null

  const hasProfileData = userProfile && (
    userProfile.occupation != null ||
    (userProfile.interests?.length ?? 0) > 0 ||
    (userProfile.tools?.length ?? 0) > 0 ||
    (userProfile.goals?.length ?? 0) > 0 ||
    userProfile.location != null
  )

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

            {/* ── 记忆板块 Tab ── */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="p-4 bg-gray-50/60 border border-gray-200/70 rounded-2xl">
                  <h3 className="text-xs font-bold text-gray-700 mb-1 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    关于你的记忆
                  </h3>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    AI 从每次对话中自动摘取你透露的信息，在这里积累成你的专属记忆。
                  </p>
                </div>

                {isMemoryLoading ? (
                  <div className="text-center text-gray-400 py-8">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto mb-2" />
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
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
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
                {/* 用户画像区块 */}
                {hasProfileData && (
                  <div className="p-4 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">用户画像</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isEditingProfile ? (
                          <>
                            <button
                              onClick={handleStartEditProfile}
                              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              编辑
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm('确定清空用户画像？')) {
                                  await fetch('/api/memory/profile', { method: 'DELETE' })
                                  setUserProfile(null)
                                }
                              }}
                              className="text-[10px] text-gray-300 hover:text-red-400 transition-colors"
                            >
                              清空
                            </button>
                          </>
                        ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveProfile}
                            className="flex items-center gap-1 text-[10px] text-green-600 hover:text-green-700 font-medium transition-colors"
                          >
                            <Check className="w-2.5 h-2.5" />
                            保存
                          </button>
                          <button
                            onClick={handleCancelEditProfile}
                            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                    {isEditingProfile ? (
                      <div className="space-y-2">
                        {/* occupation */}
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="职业"
                            value={editProfileDraft.occupation ?? ''}
                            onChange={e => setEditProfileDraft(d => ({ ...d, occupation: e.target.value }))}
                          />
                        </div>
                        {/* location */}
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="城市/地区"
                            value={editProfileDraft.location ?? ''}
                            onChange={e => setEditProfileDraft(d => ({ ...d, location: e.target.value }))}
                          />
                        </div>
                        {/* writingStyle */}
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="回答风格（如简洁、详细）"
                            value={editProfileDraft.writingStyle ?? ''}
                            onChange={e => setEditProfileDraft(d => ({ ...d, writingStyle: e.target.value }))}
                          />
                        </div>
                        {/* interests */}
                        <div className="flex items-start gap-2">
                          <Heart className="w-3 h-3 text-gray-400 mt-1.5 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="兴趣（逗号分隔）"
                            value={(editProfileDraft.interests ?? []).join(', ')}
                            onChange={e => setEditProfileDraft(d => ({ ...d, interests: parseArrField(e.target.value) }))}
                          />
                        </div>
                        {/* tools */}
                        <div className="flex items-start gap-2">
                          <Wrench className="w-3 h-3 text-gray-400 mt-1.5 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="工具/技术（逗号分隔）"
                            value={(editProfileDraft.tools ?? []).join(', ')}
                            onChange={e => setEditProfileDraft(d => ({ ...d, tools: parseArrField(e.target.value) }))}
                          />
                        </div>
                        {/* goals */}
                        <div className="flex items-start gap-2">
                          <Target className="w-3 h-3 text-gray-400 mt-1.5 flex-shrink-0" />
                          <input
                            className="flex-1 text-[11px] text-gray-700 border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                            placeholder="目标（逗号分隔）"
                            value={(editProfileDraft.goals ?? []).join(', ')}
                            onChange={e => setEditProfileDraft(d => ({ ...d, goals: parseArrField(e.target.value) }))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {userProfile!.occupation && (
                          <div className="flex items-start gap-2">
                            <Briefcase className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[11px] text-gray-700">{userProfile!.occupation}</span>
                          </div>
                        )}
                        {userProfile!.location && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[11px] text-gray-700">{userProfile!.location}</span>
                          </div>
                        )}
                        {(userProfile!.interests?.length ?? 0) > 0 && (
                          <div className="flex items-start gap-2">
                            <Heart className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {userProfile!.interests!.map((item, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px] font-medium">{item}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(userProfile!.tools?.length ?? 0) > 0 && (
                          <div className="flex items-start gap-2">
                            <Wrench className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {userProfile!.tools!.map((item, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[10px] font-medium">{item}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(userProfile!.goals?.length ?? 0) > 0 && (
                          <div className="flex items-start gap-2">
                            <Target className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {userProfile!.goals!.map((item, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded-md text-[10px] font-medium">{item}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {userProfile!.writingStyle && (
                          <div className="mt-1 text-[10px] text-gray-400 italic">回答风格：{userProfile!.writingStyle}</div>
                        )}
                        {userProfile!.lastExtracted && (
                          <div className="text-[10px] text-gray-300 flex items-center gap-1 pt-1 border-t border-gray-100">
                            <Calendar className="w-2.5 h-2.5" />
                            最近更新：{userProfile!.lastExtracted.split('T')[0]}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 偏好规则列表 */}
                <div className="space-y-3">
                  <p className="text-[11px] text-gray-400 leading-relaxed pb-1">
                    每次你觉得回答不对劲，说出来，我就会记住。这里是已经记下来的规则。
                  </p>
                  {profile.rules.length === 0 ? (
                    <div className="text-center text-gray-400 py-12 space-y-2">
                      <Sparkles className="w-8 h-8 mx-auto opacity-20" />
                      <p className="text-xs">尚未习得任何偏好</p>
                    </div>
                  ) : (
                    profile.rules
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((rule, idx) => (
                        <div key={idx} className="p-3 bg-gray-50/50 border border-gray-100 rounded-2xl">
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${rule.confidence > 0.8 ? 'bg-green-400' : rule.confidence > 0.5 ? 'bg-blue-400' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-800 font-medium leading-relaxed">
                                {rule.preference}
                              </div>
                              <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                                <Calendar className="w-2.5 h-2.5" />
                                最后活跃：{rule.updatedAt.split('T')[0]}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (confirm('确定要遗忘这条偏好吗？')) {
                                  await removePreference(idx)
                                }
                              }}
                              className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>

                {/* 全量清空并开启新手教程 */}
                <div className="pt-4 border-t border-gray-100">
                  <button
                    onClick={async () => {
                      if (!confirm('将清空：用户画像、全部记忆（含检索索引）、全部进化基因、画布节点与对话记录，然后以全新状态打开新手教程。确定继续？')) return
                      try {
                        await Promise.all([
                          fetch('/api/memory/profile', { method: 'DELETE' }),
                          fetch('/api/memory/facts', { method: 'DELETE' }),
                          fetch('/api/memory/index', { method: 'DELETE' })
                        ])
                        setUserProfile(null)
                        setMemoryFacts([])
                        setConversations([])
                        await clearAllForOnboarding()
                        onClose()
                      } catch (e) {
                        console.error('清空失败:', e)
                        alert('清空失败，请重试')
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50/80 border border-gray-200 hover:border-amber-200 rounded-xl transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    全量清空并开启新手教程
                  </button>
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
