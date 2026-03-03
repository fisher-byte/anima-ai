import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, CheckCircle2, Copy, RefreshCw, Square, Paperclip, ChevronDown, ChevronRight, X, Layers, ArrowUp, File as FileIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import type { PreferenceRule, Conversation, FileAttachment } from '@shared/types'
import type { AIMessage } from '@shared/types'
import { parseFiles, formatFilesForAI } from '../../../services/fileParsing'

const MEMORY_USER_MAX = 80
const MEMORY_ASSISTANT_MAX = 150

type Turn = {
  user: string
  assistant: string
  reasoning?: string
  images?: string[]
  files?: import('@shared/types').FileAttachment[]
  error?: string
  memoryCategory?: string
  memories?: { conv: Conversation; category?: string }[]
}

/** 将相关记忆压缩为简短参考文本再注入 AI，避免全文灌入 */
function compressMemoriesForPrompt(memories: { conv: Conversation; category?: string }[]): string {
  if (!memories?.length) return ''
  return memories
    .map(({ conv }) => {
      const u = (conv.userMessage || '').slice(0, MEMORY_USER_MAX)
      const a = (conv.assistantMessage || '').slice(0, MEMORY_ASSISTANT_MAX)
      return `用户：${u}${conv.userMessage.length > MEMORY_USER_MAX ? '…' : ''}\n助手：${a}${conv.assistantMessage.length > MEMORY_ASSISTANT_MAX ? '…' : ''}`
    })
    .join('\n\n')
}

function parseTurnsFromAssistantMessage(message: string, reasoning?: string, initialImages?: string[], initialFiles?: import('@shared/types').FileAttachment[]): Turn[] | null {
  if (!message) return null

  // 兼容旧格式或单次回答（无分段标记）
  if (!message.includes('#1\n') && !message.includes('# 1\n')) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }

  const turns: Turn[] = []
  // 修复：AI[：:] 后面支持紧跟换行（\s* 涵盖换行），分段分隔符支持空行或下一个 # 数字
  const sectionRegex = /#\s*(\d+)\s*\n+用户[：:]\s*([\s\S]*?)\nAI[：:]\s*([\s\S]*?)(?=\n+#\s*\d+\s*\n|$)/g
  let match

  while ((match = sectionRegex.exec(message)) !== null) {
    const userContent = match[2].trim()
    let aiContent = match[3].trim()
    const index = parseInt(match[1])

    // 提取思考内容（支持 "思考：...\n\n正文" 和 "思考：...\n正文"）
    let turnReasoning = undefined
    const reasoningMatch = aiContent.match(/^思考：([\s\S]*?)\n\n([\s\S]*)$/)
    if (reasoningMatch) {
      turnReasoning = reasoningMatch[1].trim()
      aiContent = reasoningMatch[2].trim()
    }

    if (userContent || aiContent) {
      turns.push({
        user: userContent,
        assistant: aiContent,
        reasoning: turnReasoning,
        images: index === 1 ? initialImages : undefined,
        files: index === 1 ? initialFiles : undefined
      })
    }
  }

  // 正则没匹配到时，做安全降级：整段当作单轮 assistant 内容
  if (turns.length === 0) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }

  return turns
}

/** 展示时清理原始格式标记，避免 #数字、用户：、AI: 等被渲染出来 */
function stripLeadingNumberHeading(text: string): string {
  if (!text) return text
  // 去掉开头的 #数字 行
  let s = text.replace(/^#+\s*\d+\s*\n?/, '').trim()
  // 去掉 "用户：... AI：" 前缀，只保留 AI 正文部分
  if (/AI[：:]/.test(s)) {
    s = s.replace(/^[\s\S]*?AI[：:]\s*/, '').trim()
  }
  // 去掉仅剩的 "用户：..." 前缀
  if (/^用户[：:]/.test(s)) {
    s = s.replace(/^用户[：:][^\n]*\n?/, '').trim()
  }
  return s
}

const THINK_MIN_LEN = 50 // 短于此处不展示“思考”，复刻“简单不用 think”

function ThinkingSection({ content, isStreaming, forceCollapsed }: { content: string; isStreaming: boolean; forceCollapsed?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(() => !(forceCollapsed ?? false))

  useEffect(() => {
    if (forceCollapsed) {
      setIsExpanded(false)
    }
  }, [forceCollapsed])

  if (!content && !isStreaming) return null
  if (content && content.length < THINK_MIN_LEN && !isStreaming) return null

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
            <div className="mt-2 pl-4 border-l-2 border-gray-200/60 bg-gray-50/50 rounded-r-lg text-sm text-gray-500 leading-relaxed italic">
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
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const currentConversation = useCanvasStore(state => state.currentConversation)
  const closeModal = useCanvasStore(state => state.closeModal)
  const endConversation = useCanvasStore(state => state.endConversation)
  const detectFeedback = useCanvasStore(state => state.detectFeedback)
  const addPreference = useCanvasStore(state => state.addPreference)
  const getPreferencesForPrompt = useCanvasStore(state => state.getPreferencesForPrompt)
  const getRelevantMemories = useCanvasStore(state => state.getRelevantMemories)
  const setConversationHistory = useCanvasStore(state => state.setConversationHistory)
  const setHighlight = useCanvasStore(state => state.setHighlight)
  const focusNode = useCanvasStore(state => state.focusNode)
  const nodes = useCanvasStore(state => state.nodes)

  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [detectedPreference, setDetectedPreference] = useState<PreferenceRule | null>(null)
  const [showEvolutionToast, setShowEvolutionToast] = useState(false)
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 处理文件上传
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList)
    if (fileArray.length === 0) return

    try {
      const parsedFiles = await parseFiles(fileArray)
      
      const newImages: string[] = []
      const newFiles: FileAttachment[] = []

      parsedFiles.forEach((f) => {
        const id = crypto.randomUUID()
        const attachment: FileAttachment = {
          id,
          name: f.name,
          type: f.type,
          size: f.size,
          content: f.content,
          preview: f.preview
        }
        
        if (f.preview) {
          newImages.push(f.preview)
        }
        newFiles.push(attachment)
      })

      setPendingImages(prev => [...prev, ...newImages].slice(0, 4))
      setPendingFiles(prev => [...prev, ...newFiles].slice(0, 8))
    } catch (error) {
      console.error('文件上传失败:', error)
      alert('文件解析失败，请重试')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const removeFile = (id: string) => {
    const fileToRemove = pendingFiles.find(f => f.id === id)
    if (fileToRemove?.preview) {
      setPendingImages(prev => prev.filter(img => img !== fileToRemove.preview))
    }
    setPendingFiles(prev => prev.filter(f => f.id !== id))
  }

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
          currentConversation.reasoning_content ?? '',
          currentConversation.images,
          currentConversation.files
        )
        let finalTurns = parsedTurns ?? [{
          user: currentConversation.userMessage,
          assistant: currentConversation.assistantMessage,
          reasoning: currentConversation.reasoning_content,
          images: currentConversation.images,
          files: currentConversation.files
        }]
        if (finalTurns.length === 1 && !finalTurns[0].user && currentConversation.userMessage) {
          finalTurns = [{ ...finalTurns[0], user: currentConversation.userMessage }]
        }
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
      const memories = await getRelevantMemories(currentConversation.userMessage)
      const compressed = compressMemoriesForPrompt(memories)

      setTurns([{
        user: currentConversation.userMessage,
        assistant: '',
        images: currentConversation.images,
        files: currentConversation.files,
        memoryCategory: memories[0]?.category,
        memories: memories.length > 0 ? memories : undefined
      }])
      setIsStreaming(true)
      setAppliedPreferences([])
      setFeedbackMessage('')
      setDetectedPreference(null)

      const preferences = getPreferencesForPrompt()
      sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images, compressed)
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

  // 提交反馈（连续对话）：按当前输入重查记忆并压缩注入
  const handleFeedbackSubmit = useCallback(async () => {
    const trimmed = feedbackMessage.trim()
    const hasImages = pendingImages.length > 0
    const hasFiles = pendingFiles.length > 0

    if ((!trimmed && !hasImages && !hasFiles) || isStreaming) return

    if (detectedPreference) {
      await addPreference(detectedPreference)
      setShowEvolutionToast(true)
      setTimeout(() => setShowEvolutionToast(false), 3000)
    }

    setIsStreaming(true)
    setDetectedPreference(null)

    const memories = await getRelevantMemories(trimmed)
    const category = memories[0]?.category ?? null
    // 正确映射：conv.id → node.id（NodeCard 读的是 node.id）
    const highlightedNodeIds = memories
      .map(m => nodes.find(n => n.conversationId === m.conv.id)?.id)
      .filter((id): id is string => id != null)
    setHighlight(category, highlightedNodeIds)
    if (highlightedNodeIds.length > 0) focusNode(highlightedNodeIds[0])
    const compressed = compressMemoriesForPrompt(memories)

    // 组合消息内容
    let fullMessage = trimmed
    if (hasFiles) {
      const fileContext = formatFilesForAI(pendingFiles.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        content: f.content || ''
      })))
      fullMessage = trimmed + fileContext
    }

    const history = turns.flatMap(t => [
      { role: 'user' as const, content: t.user },
      { role: 'assistant' as const, content: t.assistant }
    ])
    const currentTurn: Turn = {
      user: trimmed,
      assistant: '',
      images: pendingImages,
      files: pendingFiles,
      memoryCategory: memories[0]?.category,
      memories: memories.length > 0 ? memories : undefined
    }
    setTurns(prev => [...prev, currentTurn])

    const preferences = getPreferencesForPrompt()
    didMutateRef.current = true
    sendMessage(fullMessage, preferences, history, pendingImages, compressed)

    setFeedbackMessage('')
    setPendingImages([])
    setPendingFiles([])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [feedbackMessage, pendingImages, pendingFiles, isStreaming, detectedPreference, addPreference, getPreferencesForPrompt, sendMessage, turns, getRelevantMemories, setHighlight, focusNode])

  // 关闭并保存（同步关闭 UI，endConversation 后台异步运行，彻底防止冻结）
  const handleClose = useCallback(() => {
    if (isClosing) return
    const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)

    // 1. 在 closeModal 之前先保存所有需要的数据快照（closeModal 会把 currentConversation 置 null）
    const conversationSnapshot = currentConversation
    const stillStreaming = isStreaming
    const finalResponse =
      turns.length > 0
        ? turns
            .map((t, idx) => {
              const isLastTurn = idx === turns.length - 1
              const a = t.error ? `[API错误: ${t.error}]` : (t.assistant || (isLastTurn && stillStreaming ? '[正在生成中...]' : '[无回复]'))
              const reasoning = t.reasoning ? `思考：${t.reasoning}\n\n` : ''
              return `#${idx + 1}\n用户：${t.user}\nAI：\n${reasoning}${a}`
            })
            .join('\n\n')
        : (errorMessage ? `[API错误: ${errorMessage}]` : '[无回复]')
    const lastReasoning = turns.length > 0 ? turns[turns.length - 1].reasoning : ''
    const savedAppliedPreferences = [...appliedPreferences]

    // 2. 触发关闭动画，动画结束后再重置状态并关闭
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      setTurns([])
      setErrorMessage(null)
      setFeedbackMessage('')
      setDetectedPreference(null)
      setAppliedPreferences([])
      closeModal()

      // 3. 后台保存
      if (shouldSave && conversationSnapshot) {
        endConversation(finalResponse, savedAppliedPreferences, lastReasoning, conversationSnapshot)
          .catch(err => console.error('后台保存对话失败:', err))
      }
    }, 500)
  }, [isClosing, turns, errorMessage, isStreaming, currentConversation, endConversation, closeModal, appliedPreferences])

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
    <AnimatePresence>
      {isModalOpen && (
        <>
        {/* 遮罩层：点击空白处关闭 */}
        <motion.div
          className="fixed inset-0 z-40 bg-black/30"
          animate={{ opacity: isClosing ? 0 : 1 }}
          transition={{ duration: 0.4 }}
          aria-hidden
          onClick={handleClose}
        />

        {/* 关闭时节点固化动画：对话碎片飞向画布右上角（新节点所在区域），传达"固化为节点"概念 */}
        <AnimatePresence>
          {isClosing && (
            <div className="fixed inset-0 z-[55] pointer-events-none">
              {/* 中心汇聚提示 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-full shadow-lg"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                已固化到画布
              </motion.div>

              {/* 碎片飞向画布（右上方向，模拟节点区域） */}
              {[...Array(6)].map((_, i) => {
                // 飞向右上方随机散落，模拟落在画布节点区
                const tx = 180 + i * 60 + Math.sin(i * 1.3) * 40
                const ty = -(220 + i * 30 + Math.cos(i * 1.1) * 30)
                const nodeColors = ['#F0FDF4', '#EFF6FF', '#FDF4FF', '#FFFBEB', '#FFF1F2', '#F0F9FF']
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 1, scale: 1, x: 0, y: 0, left: '50%', top: '50%' }}
                    animate={{ opacity: 0, scale: 0.6, x: tx, y: ty }}
                    transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1], delay: i * 0.04 }}
                    className="absolute w-32 h-10 rounded-xl border border-gray-200 shadow-sm -ml-16 -mt-5 flex items-center px-3 gap-2"
                    style={{ background: nodeColors[i % nodeColors.length] }}
                  >
                    <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                    <div className="h-1.5 bg-gray-200 rounded flex-1" />
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>

        {/* 外层普通 div 负责 fixed 定位——Framer Motion 的 animate 不会覆盖它的 transform */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[64rem]" onClick={e => e.stopPropagation()}>
        <motion.div
          initial={{ opacity: 0, borderRadius: 32, y: 50 }}
          animate={isClosing
            ? { opacity: 0, scale: 0.96, y: 30, transition: { duration: 0.4, ease: 'easeIn' } }
            : { opacity: 1, borderRadius: 24, y: 0 }
          }
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full h-[85vh] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.08)] border-t border-gray-200 flex flex-col overflow-hidden rounded-t-3xl"
        >
            {/* 头部导航 */}
            <div className="flex items-center justify-end px-6 py-3 border-b border-gray-100 bg-white">
               <button
                 onClick={handleClose}
                 className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
               >
                 <X className="w-5 h-5" />
               </button>
            </div>

            {/* 对话内容区 */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth space-y-8"
            >
              <div className="max-w-2xl mx-auto space-y-10">
                {turns.map((t, idx) => (
                  <div key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 用户消息：ChatGPT 风格浅色气泡，操作按钮在气泡外下方 */}
                    <div className="flex justify-end mb-6">
                      <div className="flex flex-col items-end gap-1 max-w-[85%] group/usermsg">
                        {t.images && t.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {t.images.map((img, i) => (
                              <img key={i} src={img} className="w-32 h-32 object-cover rounded-2xl border border-gray-100 shadow-sm" />
                            ))}
                          </div>
                        )}
                        {t.files && t.files.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {t.files.map((file, i) => (
                              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                                <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-xs font-bold text-gray-600 uppercase tracking-tight">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-[#F4F4F4] rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed text-gray-900 min-w-[60px] max-w-full">
                           {editingIndex === idx ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm outline-none text-gray-900"
                                  rows={3}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      handleSaveEdit()
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingIndex(null)
                                    }
                                  }}
                                />
                                <div className="flex justify-end gap-2 text-xs">
                                  <button onClick={() => setEditingIndex(null)} className="opacity-70 hover:opacity-100">取消</button>
                                  <button onClick={handleSaveEdit} className="font-bold hover:underline">保存</button>
                                </div>
                              </div>
                           ) : (
                             <div>{t.user}</div>
                           )}
                        </div>

                        {/* 本轮记忆引用标签：显示在气泡下方 */}
                        {t.memories && t.memories.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-1.5 justify-end flex-wrap"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full border border-gray-200 text-gray-600 text-[11px] font-medium">
                              <Layers className="w-3 h-3 flex-shrink-0" />
                              <span>引用了 {t.memories.length} 条记忆：</span>
                              <span className="opacity-75 truncate max-w-[140px]">{t.memories[0].conv.userMessage.slice(0, 20)}{t.memories[0].conv.userMessage.length > 20 ? '…' : ''}</span>
                            </div>
                          </motion.div>
                        )}

                        {/* 气泡外下方：编辑、复制按钮，hover 时淡入 */}
                        {!isStreaming && editingIndex !== idx && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/usermsg:opacity-100 transition-opacity duration-150">
                            <button
                              onClick={() => handleStartEdit(idx, t.user)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleCopyMessage(t.user, idx)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title="复制"
                            >
                              {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI 回复 */}
                    <div className="flex justify-start mb-2">
                      <div className="max-w-[95%] w-full">
                        <ThinkingSection
                            content={t.reasoning || ''}
                            isStreaming={isStreaming && idx === turns.length - 1 && !t.assistant}
                            forceCollapsed={!!t.assistant || idx > 0}
                        />

                        <div className="text-gray-800 text-[15px] leading-7 group/aimsg">
                            {t.error ? (
                                <div className="text-red-500 text-sm">{t.error}</div>
                            ) : (
                                <div className="prose prose-slate max-w-none prose-sm prose-p:my-1.5 prose-headings:my-2">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {stripLeadingNumberHeading(t.assistant || (isStreaming && idx === turns.length - 1 ? '...' : ''))}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {/* AI 回复外下方：操作按钮 */}
                            {t.assistant && !isStreaming && (
                              <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover/aimsg:opacity-100 transition-opacity duration-150">
                                <button
                                  onClick={() => handleCopyMessage(t.assistant, idx)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                  title="复制"
                                >
                                  {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleRegenerate(idx)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                  title="重新生成"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部输入区 (对话岛模式) */}
            <div className="p-4 bg-white border-t border-gray-100">
              <div className="max-w-2xl mx-auto relative">
                 {/* Evolution Toast */}
                 <AnimatePresence>
                    {showEvolutionToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute -top-10 left-0 right-0 flex justify-center"
                        >
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-lg">
                                <Sparkles className="w-3 h-3 text-yellow-400" />
                                <span>偏好已应用并进化</span>
                            </div>
                        </motion.div>
                    )}
                 </AnimatePresence>

                 <div className="flex items-end gap-2 bg-white rounded-[24px] p-2 border border-gray-200 shadow-sm focus-within:border-gray-900 transition-all relative">
                    {/* File Previews */}
                    <AnimatePresence>
                      {(pendingFiles.length > 0 || pendingImages.length > 0) && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-2 p-2 bg-white/90 backdrop-blur-md rounded-xl border border-gray-100 shadow-lg"
                        >
                          {pendingImages.map((img, i) => (
                            <div key={`p-img-${i}`} className="relative group w-12 h-12">
                              <img src={img} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                              <button onClick={() => removeFile(pendingFiles.find(f => f.preview === img)?.id || '')} className="absolute -top-1 -right-1 bg-white rounded-full shadow border p-0.5 opacity-0 group-hover:opacity-100">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {pendingFiles.filter(f => !f.preview).map(f => (
                            <div key={f.id} className="relative group flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                              <FileIcon className="w-3 h-3 text-gray-400" />
                              <span className="max-w-[80px] truncate">{f.name}</span>
                              <button onClick={() => removeFile(f.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileSelect}
                      multiple
                    />

                    <div className="flex-1 relative" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                        <textarea
                            ref={textareaRef}
                            value={feedbackMessage}
                            onChange={handleFeedbackChange}
                            placeholder="回复..."
                            className="w-full bg-transparent border-none outline-none resize-none py-3 text-[15px] max-h-[120px]"
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleFeedbackSubmit()
                                }
                            }}
                        />
                    </div>
                    
                    {isStreaming ? (
                        <button
                            onClick={handleStopGeneration}
                            className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md"
                            title="停止生成"
                        >
                            <Square className="w-4 h-4 animate-pulse fill-white" />
                        </button>
                    ) : (
                        <button
                            onClick={handleFeedbackSubmit}
                            disabled={(!feedbackMessage.trim() && pendingFiles.length === 0)}
                            className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black disabled:opacity-40 disabled:bg-gray-200 transition-all shadow-sm"
                        >
                            <ArrowUp className="w-5 h-5 stroke-[3px]" />
                        </button>
                    )}
                 </div>
              </div>
            </div>

          </motion.div>
        </div>
        </>
        )}
      </AnimatePresence>
  )
}
