import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, CheckCircle2, Edit3, Globe, Copy, RefreshCw, Square, Paperclip } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import { GrayHint } from './GrayHint'
import type { PreferenceRule, Conversation } from '@shared/types'

type Turn = {
  user: string
  assistant: string
  images?: string[]
  files?: import('@shared/types').FileAttachment[]
  error?: string
}

function parseTurnsFromAssistantMessage(message: string, initialImages?: string[], initialFiles?: import('@shared/types').FileAttachment[]): Turn[] | null {
  if (!message) return null

  // 兼容旧格式或单次回答
  if (!message.includes('#1\n')) {
    return [{ user: '', assistant: message, images: initialImages, files: initialFiles }]
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
    setConversationHistory
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

  const hasAnyAnswer = useMemo(() => turns.some(t => !!t.assistant || !!t.error), [turns])

  const { sendMessage, resetHistory, cancel } = useAI({
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
      // 关闭后继续保存，避免阻塞返回画布，但保留错误处理
      endConversation(finalResponse, appliedPreferences).catch(err => {
        console.error('保存对话失败:', err)
        // 可以在这里添加 toast 提示，但目前保持静默失败
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
    <div
      className={`fixed inset-0 z-50 bg-white transition-all duration-300 ease-out ${
        isClosing ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* 头部导航 */}
      <div className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <button
          onClick={handleClose}
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
        >
          <svg
            className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span className="text-sm font-medium">返回画布</span>
        </button>

        {/* 标题 */}
        <div className="absolute left-1/2 transform -translate-x-1/2 text-sm text-gray-500">
          {errorMessage ? (
            <span className="flex items-center gap-2 text-red-500">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              发生错误
            </span>
          ) : isStreaming ? (
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500 animate-pulse" />
              <span className="font-medium text-blue-600">AI 正在联网研究中...</span>
            </span>
          ) : hasAnyAnswer ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span>对话完成</span>
            </span>
          ) : (
            <span>准备中...</span>
          )}
        </div>

        {/* 占位保持平衡 */}
        <div className="w-24" />
      </div>

      {/* 对话内容区 */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto pt-16 pb-48"
      >
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {turns.map((t, idx) => (
            <div key={idx} className="space-y-4 group/turn">
              {/* 用户消息 */}
              <div className="flex justify-end items-start gap-2">
                <div className="flex flex-col items-end gap-2 max-w-[85%]">
                  {/* 图片展示 */}
                  {t.images && t.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1 justify-end">
                      {t.images.map((img, i) => (
                        <img key={i} src={img} className="w-32 h-32 object-cover rounded-xl border border-gray-100 shadow-sm" />
                      ))}
                    </div>
                  )}

                  {/* 文件展示 */}
                  {t.files && t.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1 justify-end">
                      {t.files.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 text-xs"
                        >
                          <Paperclip className="w-3 h-3 text-blue-500" />
                          <span className="text-blue-700 font-medium">{file.name}</span>
                          {file.content && (
                            <span className="text-blue-400">
                              ({file.content.length > 1000 ? `${(file.content.length / 1000).toFixed(1)}k` : file.content.length} 字符)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 文字气泡 */}
                  <div className="relative group/bubble flex items-center gap-2">
                    {/* 编辑按钮（仅非流式且悬停时显示） */}
                    {!isStreaming && editingIndex !== idx && (
                      <button
                        onClick={() => handleStartEdit(idx, t.user)}
                        className="opacity-0 group-hover/bubble:opacity-100 p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                        title="编辑消息"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="bg-gray-100 rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-800 text-[15px] leading-relaxed">
                      {editingIndex === idx ? (
                        <div className="flex flex-col gap-2 min-w-[300px]">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full bg-white border border-blue-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded-md transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                            >
                              保存并重新发送
                            </button>
                          </div>
                        </div>
                      ) : (
                        t.user
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI回复 */}
              <div className="flex justify-start">
                <div className="max-w-[90%] space-y-2">
                  {/* AI标识 */}
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                      AI
                    </div>
                    <span>Assistant</span>
                    {isStreaming && idx === turns.length - 1 && (
                      <span className="flex gap-1">
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>

                  {/* AI消息内容 */}
                  <div className="relative group/message">
                    <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-2xl rounded-tl-sm px-5 py-4">
                      {t.error ? (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span className="font-medium">API调用失败</span>
                          </div>
                          <p className="text-sm">{t.error}</p>
                          <p className="text-xs mt-2 text-red-500">
                            提示: 点击"返回画布"仍可保存这个问题节点，稍后配置正确的API Key后可重新提问
                          </p>
                        </div>
                      ) : t.assistant ? (
                        <div className="prose prose-gray max-w-none">
                          {t.assistant}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          <span>正在思考...</span>
                        </div>
                      )}
                    </div>

                    {/* 消息操作按钮 */}
                    {t.assistant && !isStreaming && (
                      <div className="absolute -bottom-8 left-0 flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                        {/* 复制按钮 */}
                        <button
                          onClick={() => handleCopyMessage(t.assistant, idx)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-all"
                          title="复制回复"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                              <span className="text-green-600">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制</span>
                            </>
                          )}
                        </button>

                        {/* 重新生成按钮 */}
                        <button
                          onClick={() => handleRegenerate(idx)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                          title="重新生成"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>重新生成</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 灰字提示：只在最后一轮显示 */}
                  {idx === turns.length - 1 && appliedPreferences.length > 0 && t.assistant && !isStreaming && (
                    <div className="pt-2">
                      <GrayHint preferences={appliedPreferences} />
                    </div>
                  )}

                  {/* 记忆加载提示 */}
                  {idx === 0 && relevantMemories.length > 0 && !isStreaming && (
                    <div className="pt-2">
                      <GrayHint
                        preferences={[]}
                        type="memory"
                        message={`已联结关于 "${relevantMemories[0].userMessage.slice(0, 10)}..." 的历史记忆`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* 底部反馈区 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-100/50">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <AnimatePresence>
            {!isStreaming && hasAnyAnswer && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-4"
              >
                {/* 进化提示（极其微弱的告知） */}
                {showEvolutionToast && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[10px] text-gray-400/60 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>AI 正在根据你的反馈无声进化...</span>
                  </motion.div>
                )}

                {/* 对话输入组 */}
                <div className="relative group">
                  <textarea
                    ref={textareaRef}
                    value={feedbackMessage}
                    onChange={handleFeedbackChange}
                    placeholder="继续对话，或通过反馈引导我进化..."
                    className="w-full bg-gray-50/30 border border-gray-100/50 rounded-2xl px-5 py-4 text-[15px] outline-none focus:ring-1 focus:ring-blue-100/30 focus:bg-white transition-all resize-none min-h-[56px] max-h-[160px] pr-12"
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
                    className="absolute right-3 bottom-3 p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-20 transition-all shadow-md"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                {/* 自动学习提示 */}
                {detectedPreference && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-2 text-[11px] text-gray-400"
                  >
                    <Sparkles className="w-3 h-3 text-yellow-400" />
                    <span>检测到新偏好：{detectedPreference.preference}</span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* 停止生成按钮 */}
            {isStreaming && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={handleStopGeneration}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-sm font-medium transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                停止生成
              </motion.button>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between text-[10px] text-gray-300 uppercase tracking-widest font-medium">
            <span>ESC BACK</span>
            <span>ENTER SEND</span>
          </div>
        </div>
      </div>
    </div>
  )
}
