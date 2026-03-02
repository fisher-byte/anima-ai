import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, CheckCircle2, Edit3, Copy, RefreshCw, Square, Paperclip, Cpu, ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import { GrayHint } from './GrayHint'
import { AI_CONFIG } from '@shared/constants'
import type { PreferenceRule, Conversation } from '@shared/types'
import type { AIMessage } from '@shared/types'

type Turn = {
  user: string
  assistant: string
  reasoning?: string
  images?: string[]
  files?: import('@shared/types').FileAttachment[]
  error?: string
}

function parseTurnsFromAssistantMessage(message: string, reasoning?: string, initialImages?: string[], initialFiles?: import('@shared/types').FileAttachment[]): Turn[] | null {
  if (!message) return null

  // 兼容旧格式或单次回答
  if (!message.includes('#1\n')) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }

  const turns: Turn[] = []
  const sectionRegex = /#\s*(\d+)\s*\n+\s*用户[：:]\s*([\s\S]*?)\n+\s*AI[：:]\s*([\s\S]*?)(?=\n+\s*#\s*\d+|$)/g
  let match

  while ((match = sectionRegex.exec(message)) !== null) {
    const userContent = match[2].trim()
    const aiContent = match[3].trim()
    const index = parseInt(match[1])

    if (userContent || aiContent) {
      turns.push({
        user: userContent,
        assistant: aiContent,
        // 只有第一轮显示初始文件
        images: index === 1 ? initialImages : undefined,
        files: index === 1 ? initialFiles : undefined
      })
    }
  }

  return turns.length > 0 ? turns : null
}

function ThinkingSection({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (!content && !isStreaming) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors group"
      >
        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="font-medium tracking-tight uppercase">
          {isStreaming ? '正在思考中...' : '已完成思考'}
        </span>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l-2 border-gray-100 text-sm text-gray-500 leading-relaxed italic">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || (isStreaming ? '...' : '')}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AnswerModal() {
  const {
    isModalOpen,
    currentConversation,
    closeModal,
    endConversation,
    detectFeedback,
    addPreference,
    getPreferencesForPrompt,
    getRelevantMemories,
    setConversationHistory,
    startConversation
  } = useCanvasStore()

  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [detectedPreference, setDetectedPreference] = useState<PreferenceRule | null>(null)
  const [showEvolutionToast, setShowEvolutionToast] = useState(false)
  const [relevantMemories, setRelevantMemories] = useState<Conversation[]>([])
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [isClosing, setIsClosing] = useState(false)

  // 编辑相关状态
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')

  // 复制提示状态
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedConversationIdRef = useRef<string | null>(null)
  const isReplayRef = useRef(false)
  const didMutateRef = useRef(false)

  // AI Hook
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { sendMessage, resetHistory, cancel } = useAI({
    onThinking: (chunk) => {
      setTurns(prev => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, reasoning: (last.reasoning || '') + chunk }
        return next
      })
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    },
    onStream: (chunk) => {
      setTurns(prev => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, assistant: (last.assistant || '') + chunk, error: undefined }
        return next
      })
      setErrorMessage(null)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    },
    onComplete: () => {
      setIsStreaming(false)
      setErrorMessage(null)
      didMutateRef.current = true
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)

      if (prefs.length >= 2 && !isReplayRef.current) {
        setShowEvolutionToast(true)
        setTimeout(() => setShowEvolutionToast(false), 4000)
      }
    },
    onError: (error) => {
      setIsStreaming(false)
      setErrorMessage(error)
      didMutateRef.current = true
      setTurns(prev => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, assistant: '', error }
        return next
      })
    },
    onStopped: () => {
      setIsStreaming(false)
      setErrorMessage('生成已停止')
      didMutateRef.current = true
    }
  })

  // 当模态框打开时
  useEffect(() => {
    if (!isModalOpen || !currentConversation) return

    const prepareConversation = async () => {
      if (currentConversation.assistantMessage) {
        isReplayRef.current = true
        didMutateRef.current = false
        const parsedTurns = parseTurnsFromAssistantMessage(
          currentConversation.assistantMessage,
          '', // TODO: 如果以后 Conversation 支持保存 reasoning，这里需要传
          currentConversation.images,
          currentConversation.files
        )
        const finalTurns = parsedTurns ?? [{
          user: currentConversation.userMessage,
          assistant: currentConversation.assistantMessage,
          images: currentConversation.images,
          files: currentConversation.files
        }]
        setTurns(finalTurns)
        
        // --- 核心修复：回放时重建对话历史，支持后续对话继承上下文 ---
        const history: AIMessage[] = []
        finalTurns.forEach(t => {
          if (t.user) history.push({ role: 'user', content: t.user })
          if (t.assistant && !t.assistant.includes('[正在生成中...]') && !t.assistant.includes('[无回复]')) {
            history.push({ role: 'assistant', content: t.assistant })
          }
        })
        setConversationHistory(history)
        
        setIsStreaming(false)
        setErrorMessage(null)
        setAppliedPreferences(currentConversation.appliedPreferences || [])
        startedConversationIdRef.current = currentConversation.id

        // --- 核心修复：如果第一轮没有回复，自动触发重新生成 ---
        if (finalTurns.length === 1 && (!finalTurns[0].assistant || finalTurns[0].assistant.includes('[正在生成中...]') || finalTurns[0].assistant.includes('[无回复]'))) {
          handleRegenerate(0)
        }
        return
      }

      if (startedConversationIdRef.current === currentConversation.id) return
      startedConversationIdRef.current = currentConversation.id

      isReplayRef.current = false
      didMutateRef.current = false
      resetHistory()
      setTurns([{
        user: currentConversation.userMessage,
        assistant: '',
        images: currentConversation.images,
        files: currentConversation.files
      }])
      setIsStreaming(true)
      setAppliedPreferences([])
      setFeedbackMessage('')
      setDetectedPreference(null)

      const memories = await getRelevantMemories(currentConversation.userMessage)
      setRelevantMemories(memories)

      const preferences = getPreferencesForPrompt()
      sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images)
    }

    prepareConversation()
  }, [isModalOpen, currentConversation, resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories])

  // 编辑消息处理
  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index)
    setEditingContent(content)
  }

  const handleSaveEdit = async () => {
    if (editingIndex === null || !currentConversation) return

    const newContent = editingContent.trim()
    if (!newContent) return

    // 截断对话历史到当前轮次
    const previousTurns = turns.slice(0, editingIndex)
    const currentTurn = turns[editingIndex]

    // 构造新的历史供 AI 使用
    const history = previousTurns.flatMap(t => [
      { role: 'user' as const, content: t.user },
      { role: 'assistant' as const, content: t.assistant }
    ])

    // 更新界面状态
    const newTurns = [...previousTurns, {
      user: newContent,
      assistant: '',
      images: currentTurn.images,
      files: currentTurn.files
    }]
    setTurns(newTurns)
    setEditingIndex(null)
    setIsStreaming(true)
    didMutateRef.current = true

    // 重新发送
    const preferences = getPreferencesForPrompt()
    sendMessage(newContent, preferences, history, currentTurn.images)
  }

  // 处理停止生成
  const handleStopGeneration = useCallback(() => {
    cancel()
  }, [cancel])

  // 处理重新生成
  const handleRegenerate = useCallback(async (index: number) => {
    if (!currentConversation) return

    const previousTurns = turns.slice(0, index)
    const currentTurn = turns[index]

    // 构造历史
    const history = previousTurns.flatMap(t => [
      { role: 'user' as const, content: t.user },
      { role: 'assistant' as const, content: t.assistant }
    ])

    // 清空当前回答并重新生成
    const newTurns = [...previousTurns, {
      user: currentTurn.user,
      assistant: '',
      images: currentTurn.images,
      files: currentTurn.files
    }]
    setTurns(newTurns)
    setIsStreaming(true)

    const preferences = getPreferencesForPrompt()
    sendMessage(currentTurn.user, preferences, history, currentTurn.images)
  }, [turns, currentConversation, sendMessage, getPreferencesForPrompt])

  // 处理复制消息
  const handleCopyMessage = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [])

  // 处理反馈输入
  const handleFeedbackChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setFeedbackMessage(value)

    const detected = detectFeedback(value)
    if (detected) {
      setDetectedPreference(detected)
    }
  }, [detectFeedback])

  // 提交反馈（连续对话）
  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackMessage.trim()) return

    if (detectedPreference) {
      await addPreference(detectedPreference)
      setShowEvolutionToast(true)
      setTimeout(() => setShowEvolutionToast(false), 3000)
    }

    setIsStreaming(true)
    setDetectedPreference(null)

    const preferences = getPreferencesForPrompt()

    // 连续对话：useAI 内部会保留历史，这里直接追加新一句即可
    didMutateRef.current = true
    setTurns(prev => [...prev, { user: feedbackMessage, assistant: '' }])
    sendMessage(feedbackMessage, preferences)
    setFeedbackMessage('')
  }, [feedbackMessage, detectedPreference, addPreference, getPreferencesForPrompt, sendMessage])

  // 关闭并保存（带平滑过渡）
  const handleClose = useCallback(async () => {
    setIsClosing(true)

    // 等待动画完成
    await new Promise(resolve => setTimeout(resolve, 300))

    const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)

    // 仅在“新对话或确实产生了新内容”时保存，避免回放重复建节点
    if (shouldSave && currentConversation) {
      // 检查当前是否仍在流式传输中
      const stillStreaming = isStreaming
      
      const finalResponse =
        turns.length > 0
          ? turns
              .map((t, idx) => {
                const isLastTurn = idx === turns.length - 1
                const a = t.error ? `[API错误: ${t.error}]` : (t.assistant || (isLastTurn && stillStreaming ? '[正在生成中...]' : '[无回复]'))
                return `#${idx + 1}\n用户：${t.user}\nAI：${a}`
              })
              .join('\n\n')
          : (errorMessage ? `[API错误: ${errorMessage}]` : '[无回复]')
      // 提取最新的推理内容（来自最后一轮）
      const lastReasoning = turns.length > 0 ? turns[turns.length - 1].reasoning : ''

      // 关闭后继续保存，保留错误处理
      endConversation(finalResponse, appliedPreferences, lastReasoning).catch(err => {
        console.error('保存对话失败:', err)
      })
    }

    // 重置状态
    setTurns([])
    setErrorMessage(null)
    setFeedbackMessage('')
    setDetectedPreference(null)
    setAppliedPreferences([])
    setIsClosing(false)
    closeModal()
  }, [turns, errorMessage, currentConversation, endConversation, closeModal, appliedPreferences])

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        if (editingIndex !== null) {
          setEditingIndex(null)
        } else {
          handleClose()
        }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isModalOpen, handleClose, editingIndex])

  if (!isModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/5 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={isClosing ? { opacity: 0, scale: 0.95, y: 20 } : { opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-3xl h-[85vh] bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden flex flex-col"
      >
        {/* 头部导航 - 极简 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/50 bg-white/30 backdrop-blur-md">
          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100/50 rounded-xl transition-all duration-200 group"
          >
            <ChevronRight className="w-4 h-4 rotate-180 transform group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-wider">返回画布</span>
          </button>

          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">
            {errorMessage ? (
              <span className="text-red-500">API Error</span>
            ) : isStreaming ? (
              <span className="text-blue-500 animate-pulse">AI Evolving...</span>
            ) : (
              <span>Dialogue Island</span>
            )}
          </div>

          <div className="w-20" /> {/* Balance */}
        </div>

        {/* 对话内容区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scroll-smooth"
        >
          <div className="max-w-2xl mx-auto">
            {turns.map((t, idx) => (
              <div key={idx} className="mb-12 last:mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* 用户消息 */}
                <div className="flex justify-end mb-6">
                  <div className="flex flex-col items-end gap-3 max-w-[85%]">
                    {t.images && t.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {t.images.map((img, i) => (
                          <img key={i} src={img} className="w-24 h-24 object-cover rounded-2xl border border-gray-100 shadow-sm" />
                        ))}
                      </div>
                    )}
                    
                    {t.files && t.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {t.files.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 text-[11px]">
                            <Paperclip className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-600 font-bold uppercase tracking-tight">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="relative group/user">
                      <div className="bg-gray-100/80 backdrop-blur-sm rounded-[24px] rounded-tr-sm px-6 py-4 text-gray-800 text-[15px] leading-relaxed shadow-sm border border-gray-200/20">
                        {editingIndex === idx ? (
                          <div className="flex flex-col gap-3 min-w-[280px]">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-[15px] outline-none focus:ring-2 focus:ring-blue-100 text-gray-800 transition-all"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingIndex(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">取消</button>
                              <button onClick={handleSaveEdit} className="px-5 py-2 text-xs bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg">更新消息</button>
                            </div>
                          </div>
                        ) : (
                          t.user
                        )}
                      </div>
                      {!isStreaming && editingIndex !== idx && (
                        <button
                          onClick={() => handleStartEdit(idx, t.user)}
                          className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/user:opacity-100 p-2 text-gray-400 hover:text-blue-500 transition-all"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI 回复 */}
                <div className="flex justify-start">
                  <div className="max-w-[95%] w-full">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{AI_CONFIG.MODEL}</span>
                      {isStreaming && idx === turns.length - 1 && (
                        <span className="flex gap-1 ml-1">
                          <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      )}
                    </div>

                    <ThinkingSection 
                      content={t.reasoning || ''} 
                      isStreaming={isStreaming && idx === turns.length - 1 && !t.assistant} 
                    />

                    <div className="relative group/ai">
                      <div className="text-gray-800 text-[16px] leading-[1.7] px-2 py-1">
                        {t.error ? (
                          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-5 text-red-600 text-sm italic">
                            {t.error}
                          </div>
                        ) : t.assistant ? (
                          <div className="prose prose-slate max-w-none prose-sm sm:prose-base 
                            prose-headings:font-bold prose-headings:text-gray-900 
                            prose-p:text-gray-800 prose-p:leading-relaxed
                            prose-pre:bg-gray-900/90 prose-pre:backdrop-blur-md prose-pre:text-gray-100 
                            prose-code:text-blue-600 prose-code:bg-blue-50/50 prose-code:px-1.5 prose-code:rounded-md
                            prose-table:border-collapse prose-table:w-full prose-table:my-6
                            prose-th:border prose-th:border-gray-200/50 prose-th:bg-gray-50/50 prose-th:px-4 prose-th:py-3 prose-th:text-left
                            prose-td:border prose-td:border-gray-200/50 prose-td:px-4 prose-td:py-3
                            prose-img:rounded-2xl prose-img:shadow-xl">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {t.assistant}
                            </ReactMarkdown>
                          </div>
                        ) : null}
                      </div>

                      {/* AI 回复工具栏 (悬浮) */}
                      {t.assistant && !isStreaming && (
                        <div className="flex items-center gap-1 mt-4 ml-2 opacity-0 group-hover/ai:opacity-100 transition-all">
                          <button onClick={() => handleCopyMessage(t.assistant, idx)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-xl transition-all">
                            {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleRegenerate(idx)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-xl transition-all">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={async () => {
                              const userMsg = window.prompt('输入新分支的起始消息：', t.user)
                              if (userMsg && currentConversation) {
                                await startConversation(userMsg, t.images, t.files, currentConversation.id)
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 rounded-xl transition-all"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 记忆与偏好提示 */}
                {idx === turns.length - 1 && appliedPreferences.length > 0 && !isStreaming && (
                  <div className="mt-6 ml-10">
                    <GrayHint preferences={appliedPreferences} />
                  </div>
                )}
                {idx === 0 && relevantMemories.length > 0 && !isStreaming && (
                  <div className="mt-4 ml-10">
                    <GrayHint preferences={[]} type="memory" message={`已联结关于 "${relevantMemories[0].userMessage.slice(0, 10)}..." 的历史记忆`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 底部反馈/输入区 */}
        <div className="p-6 bg-white/40 backdrop-blur-xl border-t border-gray-100/50">
          <div className="max-w-2xl mx-auto relative">
            <AnimatePresence mode="wait">
              {isStreaming ? (
                <motion.div
                  key="stop-btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex justify-center"
                >
                  <button
                    onClick={handleStopGeneration}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-2xl font-bold shadow-xl hover:bg-black transition-all group"
                  >
                    <Square className="w-4 h-4 fill-white animate-pulse" />
                    <span>停止生成</span>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="input-area"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="relative group">
                    <AnimatePresence>
                      {showEvolutionToast && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute -top-10 left-0 right-0 flex items-center justify-center gap-2 text-[10px] text-gray-400/60 font-bold uppercase tracking-[0.1em]"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>AI 正在根据你的反馈无声进化...</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <textarea
                      ref={textareaRef}
                      value={feedbackMessage}
                      onChange={handleFeedbackChange}
                      placeholder="发送反馈或继续对话..."
                      className="w-full bg-gray-50/50 border border-gray-200/50 rounded-[24px] px-6 py-4 pr-14 text-[15px] outline-none focus:ring-2 focus:ring-blue-100/50 focus:bg-white transition-all resize-none min-h-[60px] max-h-[160px] shadow-inner"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleFeedbackSubmit()
                        }
                      }}
                    />
                    <button
                      onClick={handleFeedbackSubmit}
                      disabled={!feedbackMessage.trim()}
                      className="absolute right-3 bottom-3 p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black disabled:opacity-20 transition-all shadow-lg"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {detectedPreference && (
                    <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      <Sparkles className="w-3 h-3 text-yellow-500" />
                      <span>检测到新偏好：{detectedPreference.preference}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
