import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, CheckCircle2, Edit3, Copy, RefreshCw, Square, Paperclip, ChevronDown, ChevronRight, X, Loader2, File as FileIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import { GrayHint } from './GrayHint'
import { AI_CONFIG } from '@shared/constants'
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

  // 兼容旧格式或单次回答
  if (!message.includes('#1\n')) {
    return [{ user: '', assistant: message, reasoning, images: initialImages, files: initialFiles }]
  }

  const turns: Turn[] = []
  const sectionRegex = /#\s*(\d+)\s*\n+\s*用户[：:]\s*([\s\S]*?)\n+\s*AI[：:]\s*([\s\S]*?)(?=\n+\s*#\s*\d+|$)/g
  let match

  while ((match = sectionRegex.exec(message)) !== null) {
    const userContent = match[2].trim()
    let aiContent = match[3].trim()
    const index = parseInt(match[1])

    // 提取思考内容
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
        // 只有第一轮显示初始文件
        images: index === 1 ? initialImages : undefined,
        files: index === 1 ? initialFiles : undefined
      })
    }
  }

  return turns.length > 0 ? turns : null
}

/** 展示时去掉内容里开头的 #数字 行，避免被渲染成巨大标题 */
function stripLeadingNumberHeading(text: string): string {
  let s = text.replace(/^#\s*\d+\s*\n?/, '').trim()
  // 多轮或单轮错位时可能带「用户：… AI：」前缀，只保留 AI 输出部分
  const userAiPrefix = /^[\s\S]*?AI[：:]\s*/
  if (userAiPrefix.test(s)) s = s.replace(userAiPrefix, '').trim()
  return s
}

function ThinkingSection({ content, isStreaming, forceCollapsed }: { content: string; isStreaming: boolean; forceCollapsed?: boolean }) {
  // 有正文时默认折叠，避免先展开再收拢的闪动
  const [isExpanded, setIsExpanded] = useState(() => !(forceCollapsed ?? false))

  useEffect(() => {
    if (forceCollapsed) {
      setIsExpanded(false)
    }
  }, [forceCollapsed])

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
  const [relevantMemories, setRelevantMemories] = useState<{ conv: Conversation; category?: string }[]>([])
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 处理文件上传
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList)
    if (fileArray.length === 0) return

    setIsProcessingFiles(true)
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
    } finally {
      setIsProcessingFiles(false)
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
      setRelevantMemories(memories)
      const compressed = compressMemoriesForPrompt(memories)

      setTurns([{
        user: currentConversation.userMessage,
        assistant: '',
        images: currentConversation.images,
        files: currentConversation.files,
        memoryCategory: memories[0]?.category
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
    setRelevantMemories(memories)
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
      memoryCategory: memories[0]?.category
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
  }, [feedbackMessage, pendingImages, pendingFiles, isStreaming, detectedPreference, addPreference, getPreferencesForPrompt, sendMessage, turns, getRelevantMemories])

  // 关闭并保存（带平滑过渡）
  const handleClose = useCallback(async () => {
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
                const reasoning = t.reasoning ? `思考：${t.reasoning}\n\n` : ''
                return `#${idx + 1}\n用户：${t.user}\nAI：\n${reasoning}${a}`
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
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-3xl"
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full h-full max-w-4xl flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.05)]"
          >
            {/* 头部导航 - 仅返回 */}
            <div className="flex items-center justify-between px-8 py-6">
              <button
                onClick={handleClose}
                className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-900 hover:bg-black/5 rounded-2xl transition-all duration-300 group"
              >
                <ChevronRight className="w-4 h-4 rotate-180 transform group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm font-bold uppercase tracking-widest">返回画布</span>
              </button>
              <div className="w-24" />
            </div>

            {/* 对话内容区：顶部单行模型标签，不占块 */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-8 py-4 scroll-smooth"
            >
              <div className="max-w-xl mx-auto mb-4 text-[10px] text-gray-400 uppercase tracking-wider">
                {AI_CONFIG.MODEL}
                {isStreaming && <span className="ml-2 text-blue-500/70">正在进化中...</span>}
              </div>
              <div className="max-w-xl mx-auto space-y-12">
                {turns.map((t, idx) => (
                  <div key={idx} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                    {/* 用户消息 */}
                    <div className="flex justify-end mb-8">
                      <div className="flex flex-col items-end gap-4 max-w-[85%]">
                        {t.images && t.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {t.images.map((img, i) => (
                              <img key={i} src={img} className="w-32 h-32 object-cover rounded-3xl border border-gray-100 shadow-sm" />
                            ))}
                          </div>
                        )}
                        
                        {t.files && t.files.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {t.files.map((file, i) => (
                              <div key={i} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                                <Paperclip className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-bold text-gray-600 uppercase tracking-tight">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col items-end gap-1 group/user">
                          <div className="bg-gray-100/80 backdrop-blur-sm rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-700 text-sm leading-relaxed shadow-sm border border-gray-200/20">
                            {editingIndex === idx ? (
                              <div className="flex flex-col gap-4 min-w-[320px]">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="w-full bg-white/90 border border-gray-200 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-gray-200 text-gray-800 transition-all"
                                  rows={4}
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingIndex(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                                  <button onClick={handleSaveEdit} className="px-4 py-2 text-sm bg-gray-600 text-white hover:bg-gray-700 rounded-lg transition-colors">更新并重新进化</button>
                                </div>
                              </div>
                            ) : (
                              <div>{t.user}</div>
                            )}
                          </div>
                          {!isStreaming && editingIndex !== idx && (
                            <div className="flex items-center gap-1 opacity-0 group-hover/user:opacity-100 transition-opacity -mt-0.5">
                              <button onClick={() => handleStartEdit(idx, t.user)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-all" title="编辑">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleCopyMessage(t.user, idx)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-all" title="复制">
                                {copiedIndex === idx ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 该轮记忆联结轻量提示 */}
                    {(t.memoryCategory || (idx === 0 && relevantMemories.length > 0)) && (
                      <div className="flex justify-end mb-2">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                          已联结 {(t.memoryCategory ?? relevantMemories[0]?.category) || '相关'} 记忆
                        </span>
                      </div>
                    )}

                    {/* AI 回复：操作按钮在框外，不再在左侧占块 */}
                    <div className="flex justify-start">
                      <div className="max-w-[95%] w-full flex flex-col gap-1 group/ai">
                        <div className="min-w-0 flex-1">
                            <ThinkingSection
                              content={t.reasoning || ''}
                              isStreaming={isStreaming && idx === turns.length - 1 && !t.assistant}
                              forceCollapsed={!!t.assistant}
                            />
                            <div className="text-gray-700 text-sm leading-relaxed px-0 py-1">
                              {t.error ? (
                                <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 text-red-600 text-sm italic">
                                  {t.error}
                                </div>
                              ) : t.assistant ? (
                                <div className="prose prose-slate max-w-none prose-sm
                                  prose-headings:font-semibold prose-headings:text-gray-800 prose-headings:text-base
                                  prose-p:text-gray-700 prose-p:leading-relaxed prose-p:text-sm
                                  prose-pre:bg-gray-900/95 prose-pre:backdrop-blur-md prose-pre:text-gray-100 prose-pre:rounded-xl
                                  prose-code:text-blue-600 prose-code:bg-blue-50/50 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-lg
                                  prose-table:border-collapse prose-table:w-full prose-table:my-6
                                  prose-th:border prose-th:border-gray-200/50 prose-th:bg-gray-50/50 prose-th:px-4 prose-th:py-3 prose-th:text-left
                                  prose-td:border prose-td:border-gray-200/50 prose-td:px-4 prose-td:py-3
                                  prose-img:rounded-xl prose-img:shadow-lg">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {stripLeadingNumberHeading(t.assistant)}
                                  </ReactMarkdown>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        {t.assistant && !isStreaming && (
                          <div className="flex items-center gap-1 opacity-0 group-hover/ai:opacity-100 transition-opacity pl-0">
                            <button onClick={() => handleCopyMessage(t.assistant, idx)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-all" title="复制">
                              {copiedIndex === idx ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => handleRegenerate(idx)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-all" title="重新生成">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 记忆与偏好提示 */}
                    {idx === turns.length - 1 && appliedPreferences.length > 0 && !isStreaming && (
                      <div className="mt-8 ml-14">
                        <GrayHint preferences={appliedPreferences} />
                      </div>
                    )}
                    {idx === 0 && relevantMemories.length > 0 && !isStreaming && (
                      <div className="mt-6 ml-14">
                        <GrayHint preferences={[]} type="memory" message={`已联结关于 "${relevantMemories[0].conv.userMessage.slice(0, 10)}..." 的历史记忆`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 底部反馈/输入区 */}
            <div className="p-10">
              <div className="max-w-xl mx-auto relative">
                <AnimatePresence mode="wait">
                  {isStreaming ? (
                    <motion.div
                      key="stop-btn"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="flex justify-center"
                    >
                      <button
                        onClick={handleStopGeneration}
                        className="flex items-center gap-3 px-8 py-3 bg-gray-900 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:bg-black transition-all group"
                      >
                        <Square className="w-4 h-4 fill-white animate-pulse" />
                        <span>停止生成</span>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="input-area"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      {/* 文件预览区 */}
                      <AnimatePresence>
                        {(pendingFiles.length > 0 || isProcessingFiles) && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="flex flex-wrap gap-3 mb-4"
                          >
                            {pendingFiles.map(file => (
                              <div key={file.id} className="relative group">
                                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm">
                                  {file.preview ? (
                                    <img src={file.preview} className="w-6 h-6 object-cover rounded-md" />
                                  ) : (
                                    <FileIcon className="w-4 h-4 text-gray-400" />
                                  )}
                                  <span className="text-[10px] font-bold text-gray-600 truncate max-w-[100px] uppercase tracking-tight">{file.name}</span>
                                </div>
                                <button
                                  onClick={() => removeFile(file.id)}
                                  className="absolute -top-2 -right-2 w-5 h-5 bg-white rounded-full shadow-md border border-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {isProcessingFiles && (
                              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/50 rounded-2xl border border-blue-100/50 animate-pulse">
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">正在解析...</span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="relative group" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                        <AnimatePresence>
                          {showEvolutionToast && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute -top-12 left-0 right-0 flex items-center justify-center gap-2 text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>AI 正在根据你的反馈无声进化...</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        <textarea
                          ref={textareaRef}
                          value={feedbackMessage}
                          onChange={handleFeedbackChange}
                          placeholder="发送反馈或继续进化话题..."
                          className="w-full bg-white/50 border border-gray-200/50 rounded-[32px] px-14 py-5 pr-16 text-[16px] outline-none focus:ring-4 focus:ring-blue-500/5 focus:bg-white transition-all resize-none min-h-[68px] max-h-[200px] shadow-[0_10px_40px_rgba(0,0,0,0.02)]"
                          rows={1}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleFeedbackSubmit()
                            }
                          }}
                        />

                        {/* 附件按钮 */}
                        <div className="absolute left-4 bottom-4">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-3 text-gray-400 hover:text-blue-500 hover:bg-black/5 rounded-2xl transition-all"
                            title="上传附件 (图片, PDF, Docx, 代码)"
                          >
                            <Paperclip className="w-5 h-5" />
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="image/*,.pdf,.doc,.docx,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.go,.rs,.swift,.rb,.php,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat"
                          />
                        </div>

                        <button
                          onClick={handleFeedbackSubmit}
                          disabled={(!feedbackMessage.trim() && pendingFiles.length === 0) || isStreaming}
                          className="absolute right-4 bottom-4 p-3 bg-gray-900 text-white rounded-2xl hover:bg-black disabled:opacity-20 transition-all shadow-xl"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {detectedPreference && (
                        <div className="flex items-center justify-center gap-3 text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]">
                          <Sparkles className="w-4 h-4 text-yellow-500" />
                          <span>检测到新偏好：{detectedPreference.preference}</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
