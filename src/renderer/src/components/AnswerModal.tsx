import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import { GrayHint } from './GrayHint'
import type { PreferenceRule, Conversation } from '@shared/types'

type Turn = {
  user: string
  assistant: string
  error?: string
}

function parseTurnsFromAssistantMessage(message: string): Turn[] | null {
  if (!message) return null
  
  // 兼容旧格式或单次回答
  if (!message.includes('#1\n')) {
    return [{ user: '', assistant: message }]
  }

  const turns: Turn[] = []
  
  // 使用更健壮的正则：匹配 #数字 开头，支持全角和半角冒号，以及多余的空格
  // 支持多行内容，包括列表、Markdown等
  const sectionRegex = /#\s*(\d+)\s*\n+\s*用户[：:]\s*([\s\S]*?)\n+\s*AI[：:]\s*([\s\S]*?)(?=\n+\s*#\s*\d+|$)/g
  let match

  while ((match = sectionRegex.exec(message)) !== null) {
    const userContent = match[2].trim()
    const aiContent = match[3].trim()
    
    if (userContent || aiContent) {
      turns.push({ 
        user: userContent, 
        assistant: aiContent 
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
    getRelevantMemories
  } = useCanvasStore()
  
  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [detectedPreference, setDetectedPreference] = useState<PreferenceRule | null>(null)
  const [showEvolutionToast, setShowEvolutionToast] = useState(false)
  const [relevantMemories, setRelevantMemories] = useState<Conversation[]>([])
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [isClosing, setIsClosing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedConversationIdRef = useRef<string | null>(null)
  const isReplayRef = useRef(false)
  const didMutateRef = useRef(false)

  // AI Hook
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const { sendMessage, resetHistory } = useAI({
    onStream: (chunk) => {
      setTurns(prev => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, assistant: (last.assistant || '') + chunk, error: undefined }
        return next
      })
      setErrorMessage(null)
      // 自动滚动到底部
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    },
    onComplete: (fullText) => {
      setIsStreaming(false)
      setErrorMessage(null)
      didMutateRef.current = true
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)
      
      // 如果应用了多条偏好，且不是回放模式，触发一个小提示
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
    }
  })

  const hasAnyAnswer = useMemo(() => turns.some(t => !!t.assistant || !!t.error), [turns])

  // 当模态框打开时：新对话自动发送；回放则把内容灌入 turns
  useEffect(() => {
    if (!isModalOpen || !currentConversation) return

    // 加载记忆逻辑
    const prepareConversation = async () => {
      // 回放：已有 assistantMessage，直接展示，避免“正在思考...”卡住
      if (currentConversation.assistantMessage) {
        isReplayRef.current = true
        didMutateRef.current = false
        const parsedTurns = parseTurnsFromAssistantMessage(currentConversation.assistantMessage)
        setTurns(parsedTurns ?? [{ user: currentConversation.userMessage, assistant: currentConversation.assistantMessage }])
        setIsStreaming(false)
        setErrorMessage(null)
        setAppliedPreferences(currentConversation.appliedPreferences || [])
        startedConversationIdRef.current = currentConversation.id
        return
      }

      // 新对话：只启动一次
      if (startedConversationIdRef.current === currentConversation.id) return
      startedConversationIdRef.current = currentConversation.id

      isReplayRef.current = false
      didMutateRef.current = false
      resetHistory()
      setTurns([{ user: currentConversation.userMessage, assistant: '' }])
      setIsStreaming(true)
      setAppliedPreferences([])
      setFeedbackMessage('')
      setDetectedPreference(null)

      // 异步检索记忆
      const memories = await getRelevantMemories(currentConversation.userMessage)
      setRelevantMemories(memories)

      const preferences = getPreferencesForPrompt()
      
      // 组装带记忆的上下文（可选，目前通过 system prompt 注入，见 ai.ts 修改）
      sendMessage(currentConversation.userMessage, preferences)
    }

    prepareConversation()
  }, [isModalOpen, currentConversation, resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories])

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
    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',runId:'pre-fix',hypothesisId:'H4',location:'AnswerModal.tsx:handleFeedbackSubmit',message:'append turn and send',data:{feedbackLen:feedbackMessage.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    sendMessage(feedbackMessage, preferences)
    setFeedbackMessage('')
  }, [feedbackMessage, detectedPreference, addPreference, getPreferencesForPrompt, sendMessage])

  // 关闭并保存（带平滑过渡）
  const handleClose = useCallback(async () => {
    setIsClosing(true)
    
    // 等待动画完成
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)

    // #region agent log
    fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',runId:'pre-fix',hypothesisId:'H5',location:'AnswerModal.tsx:handleClose',message:'close modal',data:{shouldSave,isReplay:isReplayRef.current,didMutate:didMutateRef.current,turnsCount:turns.length,conversationId:currentConversation?.id||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 仅在“新对话或确实产生了新内容”时保存，避免回放重复建节点
    if (shouldSave && currentConversation) {
      const finalResponse =
        turns.length > 0
          ? turns
              .map((t, idx) => {
                const a = t.error ? `[API错误: ${t.error}]` : (t.assistant || '[无回复]')
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
        handleClose()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isModalOpen, handleClose])

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
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              AI 正在思考...
            </span>
          ) : hasAnyAnswer ? (
            <span>对话完成</span>
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
            <div key={idx} className="space-y-4">
              {/* 用户消息 */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-gray-100 rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-800 text-[15px] leading-relaxed">
                  {t.user}
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
                  <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">
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
