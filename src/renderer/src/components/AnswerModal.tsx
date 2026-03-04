import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, CheckCircle2, Copy, RefreshCw, Square, Paperclip,
  X, Layers, ArrowUp, File as FileIcon, Download, MoreHorizontal
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import type { FileAttachment, Conversation } from '@shared/types'
import type { AIMessage } from '@shared/types'
import { parseFiles, formatFilesForAI } from '../../../services/fileParsing'
import { ThinkingSection } from './ThinkingSection'
import { FileBubble } from './FileBubble'
import { OnboardingCompletePopup } from './OnboardingCompletePopup'
import {
  ONBOARDING_GREETING,
  ONBOARDING_DEFAULT_RESPONSE,
  ONBOARDING_GENE_SAVED,
  ONBOARDING_CLOSE_HINT,
  type Turn,
  compressMemoriesForPrompt,
  parseTurnsFromAssistantMessage,
  stripLeadingNumberHeading,
  buildAIHistory
} from '../utils/conversationUtils'

/** 从用户自我介绍消息中提取姓名/职业关键词，用于 toast 展示 */
function extractUserInfo(message: string): string {
  const nameMatch = message.match(/(?:我(?:叫|是|名(?:字)?叫?)|叫做?)\s*([^\s，,。！!？?]{1,8})/)
  const roleKeywords = ['产品', '设计', '开发', '工程师', '经理', '创业', '学生', '运营', '市场', '销售', '研究', '咨询', '教师', '医生', '律师', '写作', '创作']
  const foundRole = roleKeywords.find(k => message.includes(k))
  const parts: string[] = []
  if (nameMatch?.[1]) parts.push(`名字：${nameMatch[1]}`)
  if (foundRole) parts.push(`职业方向：${foundRole}`)
  return parts.length > 0 ? parts.join('，') : message.slice(0, 30)
}

export function AnswerModal() {
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const currentConversation = useCanvasStore(state => state.currentConversation)
  const closeModal = useCanvasStore(state => state.closeModal)
  const endConversation = useCanvasStore(state => state.endConversation)
  const getPreferencesForPrompt = useCanvasStore(state => state.getPreferencesForPrompt)
  const getRelevantMemories = useCanvasStore(state => state.getRelevantMemories)
  const setConversationHistory = useCanvasStore(state => state.setConversationHistory)
  const setHighlight = useCanvasStore(state => state.setHighlight)
  const focusNode = useCanvasStore(state => state.focusNode)
  const isOnboardingMode = useCanvasStore(state => state.isOnboardingMode)
  const completeOnboarding = useCanvasStore(state => state.completeOnboarding)
  const addCapabilityNode = useCanvasStore(state => state.addCapabilityNode)
  const canvasNodes = useCanvasStore(state => state.nodes)
  const onboardingResumeTurns = useCanvasStore(state => state.onboardingResumeTurns)
  const saveOnboardingTurns = useCanvasStore(state => state.saveOnboardingTurns)

  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [evolutionToast, setEvolutionToast] = useState<{ label: string; detail: string } | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const evolutionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((label: string, detail: string, duration = 4000) => {
    if (evolutionToastTimerRef.current) clearTimeout(evolutionToastTimerRef.current)
    setEvolutionToast({ label, detail })
    evolutionToastTimerRef.current = setTimeout(() => setEvolutionToast(null), duration)
  }, [])
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const [showXPulse, setShowXPulse] = useState(false)
  const [showOnboardingComplete, setShowOnboardingComplete] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const onboardingPhaseRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedConversationIdRef = useRef<string | null>(null)
  const isReplayRef = useRef(false)
  const didMutateRef = useRef(false)
  const onboardingStreamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 文件上传（本地解析 + 上传后端）──────────────────────────────────────────
  // Embedding 由后端 Agent 自动处理（embed_file 任务队列），不在前端触发
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList)
    if (fileArray.length === 0) return
    try {
      const parsedFiles = await parseFiles(fileArray)
      const newImages: string[] = []
      const newFiles: FileAttachment[] = []

      await Promise.all(parsedFiles.map(async (f, idx) => {
        const rawFile = fileArray[idx]
        const id = crypto.randomUUID()

        // 上传原始文件到后端（存储 + 自动排入 embed_file Agent 队列）
        try {
          const formData = new FormData()
          formData.append('file', rawFile)
          formData.append('id', id)
          formData.append('textContent', f.content || '')
          await fetch('/api/storage/file', { method: 'POST', body: formData })
        } catch { /* 上传失败不阻断主流程 */ }

        const attachment: FileAttachment = {
          id, name: f.name, type: f.type, size: f.size, content: f.content, preview: f.preview
        }
        if (f.preview) newImages.push(f.preview)
        newFiles.push(attachment)
      }))

      setPendingImages(prev => [...prev, ...newImages].slice(0, 4))
      setPendingFiles(prev => [...prev, ...newFiles].slice(0, 8))
    } catch (error) {
      console.error('文件上传失败:', error)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  const removeFile = (id: string) => {
    const f = pendingFiles.find(f => f.id === id)
    if (f?.preview) setPendingImages(prev => prev.filter(img => img !== f.preview))
    setPendingFiles(prev => prev.filter(f => f.id !== id))
  }

  // ── AI Hook ───────────────────────────────────────────────────────────────
  const { sendMessage, resetHistory, cancel } = useAI({
    onThinking: (chunk) => {
      setTurns(prev => {
        if (!prev.length) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, reasoning: (last.reasoning || '') + chunk }
        return next
      })
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    },
    onStream: (chunk) => {
      setTurns(prev => {
        if (!prev.length) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, assistant: (last.assistant || '') + chunk, error: undefined }
        return next
      })
      setErrorMessage(null)
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    },
    onComplete: () => {
      setIsStreaming(false)
      setErrorMessage(null)
      didMutateRef.current = true
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)

      if (prefs.length >= 2 && !isReplayRef.current) {
        showToast('✦ 进化基因生效', `已应用 ${prefs.length} 条偏好规则`)
      }

      // 新手引导阶段推进
      // phase 3 → AI 回答用户话题后：注入关闭提示
      if (isOnboardingMode && onboardingPhaseRef.current === 3) {
        onboardingPhaseRef.current = 4
        setOnboardingDone(true)
        setTimeout(() => {
          setTurns(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, assistant: (last.assistant || '') + ONBOARDING_CLOSE_HINT }
            return next
          })
          setShowXPulse(true)
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 100)
        }, 400)
      }
    },
    onError: (error) => {
      setIsStreaming(false)
      setErrorMessage(error)
      didMutateRef.current = true
      setTurns(prev => {
        if (!prev.length) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, assistant: '', error }
        return next
      })
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 50)
    },
    onStopped: () => {
      setIsStreaming(false)
      setErrorMessage('生成已停止')
      didMutateRef.current = true
    }
  })

  // ── 新手引导：打开时注入问候语（或恢复已有 turns） ─────────────────────────
  useEffect(() => {
    if (!isModalOpen || !isOnboardingMode) return
    if (!currentConversation || currentConversation.userMessage !== '') return

    if (onboardingResumeTurns && onboardingResumeTurns.length > 0) {
      // 继承上次未完成的引导对话
      setTurns(onboardingResumeTurns)
      // 推算 phase：有真实用户回复则至少到 phase2；有 GENE_SAVED 则到 phase3；有 CLOSE_HINT 则 phase4
      const hasUserTurn = onboardingResumeTurns.some(t => t.user?.trim())
      const hasGeneSaved = onboardingResumeTurns.some(t => t.assistant?.includes('进化基因已记录'))
      const hasCloseHint = onboardingResumeTurns.some(t => t.assistant?.includes('现在可以关闭') || t.assistant?.includes('✦ 你现在可以关闭'))
      if (hasCloseHint) { onboardingPhaseRef.current = 4; setOnboardingDone(true) }
      else if (hasGeneSaved) { onboardingPhaseRef.current = 3; setOnboardingDone(false) }
      else if (hasUserTurn) { onboardingPhaseRef.current = 2; setOnboardingDone(false) }
      else { onboardingPhaseRef.current = 0; setOnboardingDone(false) }
      // 恢复历史对话时滚到底部
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 80)
    } else {
      setTurns([{ user: '', assistant: ONBOARDING_GREETING }])
      onboardingPhaseRef.current = 0
      setOnboardingDone(false)
    }

    setShowXPulse(false)
    setIsStreaming(false)
    startedConversationIdRef.current = currentConversation.id
    isReplayRef.current = false
    didMutateRef.current = false
    resetHistory()
  }, [isModalOpen, isOnboardingMode, currentConversation, resetHistory, onboardingResumeTurns])

  // ── 普通模式：对话准备 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isModalOpen || !currentConversation || isOnboardingMode) return

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
        // replay 时滚到对话底部（需等 DOM 渲染完）
        setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }, 80)

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

      const preferences = getPreferencesForPrompt()
      sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images, compressed, false)
    }

    prepareConversation()
  }, [isModalOpen, currentConversation, isOnboardingMode, resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories])

  // ── 编辑 / 重生成 / 复制 ────────────────────────────────────────────────────
  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index)
    setEditingContent(content)
  }

  const handleSaveEdit = async () => {
    if (editingIndex === null || !currentConversation) return
    const newContent = editingContent.trim()
    if (!newContent) return

    const previousTurns = turns.slice(0, editingIndex)
    const currentTurn = turns[editingIndex]
    const history = buildAIHistory(previousTurns)
    const newTurns = [...previousTurns, { user: newContent, assistant: '', images: currentTurn.images, files: currentTurn.files }]
    setTurns(newTurns)
    setEditingIndex(null)
    setIsStreaming(true)
    didMutateRef.current = true
    const preferences = getPreferencesForPrompt()
    sendMessage(newContent, preferences, history, currentTurn.images)
  }

  const handleStopGeneration = useCallback(() => { cancel() }, [cancel])

  const handleRegenerate = useCallback(async (index: number) => {
    if (!currentConversation) return
    const previousTurns = turns.slice(0, index)
    const currentTurn = turns[index]
    const history = buildAIHistory(previousTurns)
    const newTurns = [...previousTurns, { user: currentTurn.user, assistant: '', images: currentTurn.images, files: currentTurn.files }]
    setTurns(newTurns)
    setIsStreaming(true)
    const preferences = getPreferencesForPrompt()
    sendMessage(currentTurn.user, preferences, history, currentTurn.images)
  }, [turns, currentConversation, sendMessage, getPreferencesForPrompt])

  const handleCopyMessage = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {}
  }, [])

  // ── 反馈输入 ──────────────────────────────────────────────────────────────
  const handleFeedbackChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedbackMessage(e.target.value)
  }, [])

  const handleFeedbackSubmit = useCallback(async () => {
    const trimmed = feedbackMessage.trim()
    const hasImages = pendingImages.length > 0
    const hasFiles = pendingFiles.length > 0
    if ((!trimmed && !hasImages && !hasFiles) || isStreaming) return

    // 偏好检测改走后端 Agent（fire-and-forget），不再前端关键词判断
    if (trimmed.length >= 5) {
      const lastAssistant = turns.length > 0 ? (turns[turns.length - 1].assistant || '') : ''
      fetch('/api/memory/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'extract_preference',
          payload: { userMessage: trimmed, assistantMessage: lastAssistant.slice(0, 300) }
        })
      }).catch(() => {})
    }

    setFeedbackMessage('')
    setPendingImages([])
    setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ── 引导 phase 2：用户给出风格反馈 → Agent 后台提取 + 注入 GENE_SAVED ──
    if (isOnboardingMode && onboardingPhaseRef.current === 2) {
      onboardingPhaseRef.current = 3
      const userTurn: Turn = { user: trimmed, assistant: ONBOARDING_GENE_SAVED }
      setTurns(prev => [...prev, userTurn])
      showToast('✦ 进化基因已记录', trimmed.slice(0, 45))
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 100)
      return
    }

    // phase 0：模拟流式输出预设样例回复，不调 AI，完成后跳到 phase 2 等待风格反馈
    if (isOnboardingMode && onboardingPhaseRef.current === 0) {
      onboardingPhaseRef.current = 2
      setIsStreaming(true)
      setTurns(prev => [...prev, { user: trimmed, assistant: '' }])

      const fullText = ONBOARDING_DEFAULT_RESPONSE
      let charIndex = 0

      // 短暂"思考"停顿后再开始输出
      const scheduleNext = () => {
        if (charIndex >= fullText.length) {
          setIsStreaming(false)
          const infoDetail = extractUserInfo(trimmed)
          showToast('✦ 人物信息已更新', infoDetail, 4000)
          return
        }
        // 标点后稍长停顿，营造自然节奏
        const ch = fullText[charIndex]
        const isPunct = /[。！？…\n]/.test(ch)
        const delay = isPunct ? 120 : 28

        charIndex += 1
        const slice = fullText.slice(0, charIndex)
        setTurns(prev => {
          if (!prev.length) return prev
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], assistant: slice }
          return next
        })
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        onboardingStreamTimerRef.current = setTimeout(scheduleNext, delay)
      }

      onboardingStreamTimerRef.current = setTimeout(scheduleNext, 800)
      return
    }

    setIsStreaming(true)

    const memories = await getRelevantMemories(trimmed)
    const category = memories[0]?.category ?? null
    const highlightedNodeIds = memories
      .map(m => m.nodeId ?? m.conv.id)
      .filter((id): id is string => id != null)
    setHighlight(category, highlightedNodeIds)
    if (highlightedNodeIds.length > 0) focusNode(highlightedNodeIds[0])
    const compressed = compressMemoriesForPrompt(memories)

    let fullMessage = trimmed
    if (hasFiles) {
      fullMessage += formatFilesForAI(pendingFiles.map(f => ({
        name: f.name, type: f.type, size: f.size, content: f.content || ''
      })))
    }

    // Bug fix: 历史中跳过空 user 的预设引导轮次，避免空消息传入 AI
    const history = buildAIHistory(turns)
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
    sendMessage(fullMessage, preferences, history, pendingImages, compressed, isOnboardingMode)
  }, [feedbackMessage, pendingImages, pendingFiles, isStreaming, isOnboardingMode,
      getPreferencesForPrompt, sendMessage, turns, getRelevantMemories, setHighlight, focusNode])

  // ── 关闭并保存 ────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isClosing) return
    const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)

    let conversationSnapshot = currentConversation
    if (isOnboardingMode && conversationSnapshot && conversationSnapshot.userMessage === '') {
      const firstRealTurn = turns.find(t => t.user?.trim())
      if (firstRealTurn) {
        conversationSnapshot = { ...conversationSnapshot, userMessage: firstRealTurn.user }
      }
    }

    const stillStreaming = isStreaming
    const finalResponse = turns.length > 0
      ? turns
          .map((t, idx) => {
            const isLastTurn = idx === turns.length - 1
            const a = t.error
              ? `[API错误: ${t.error}]`
              : (t.assistant || (isLastTurn && stillStreaming ? '[正在生成中...]' : '[无回复]'))
            const reasoning = t.reasoning ? `思考：${t.reasoning}\n\n[/THINKING]\n\n` : ''
            return `#${idx + 1}\n用户：${t.user}\nAI：\n${reasoning}${a}`
          })
          .join('\n\n')
      : (errorMessage ? `[API错误: ${errorMessage}]` : '[无回复]')

    const lastReasoning = turns.length > 0 ? turns[turns.length - 1].reasoning : ''
    const savedAppliedPreferences = [...appliedPreferences]
    // 引导完成 = 到达 phase4（AI 已注入关闭提示）
    const onboardingCompleted = isOnboardingMode && onboardingPhaseRef.current >= 4
    const onboardingInProgress = isOnboardingMode && onboardingPhaseRef.current >= 2 && !onboardingCompleted
    // 在 setTimeout 之前拍一个快照，避免被后续 setTurns([]) 影响
    const savedTurns = [...turns]

    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      setTurns([])
      setErrorMessage(null)
      setFeedbackMessage('')
      setAppliedPreferences([])
      setShowXPulse(false)
      setOnboardingDone(false)
      closeModal()

      if (onboardingCompleted) {
        // 引导全量完成：将每段真实对话独立保存为节点
        const realTurns = savedTurns.filter(t =>
          t.user?.trim() && !t.assistant?.includes('✦ 进化基因已记录')
        )
        realTurns.forEach((t, i) => {
          const cleanAssistant = (t.assistant || '').replace(ONBOARDING_CLOSE_HINT, '').trim()
          const conv: Conversation = {
            id: i === 0 && conversationSnapshot ? conversationSnapshot.id : crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            userMessage: t.user,
            assistantMessage: cleanAssistant,
            images: t.images || [],
            files: t.files || []
          }
          endConversation(cleanAssistant, [], t.reasoning, conv)
            .catch(err => console.error('引导对话节点保存失败:', err))
        })
        localStorage.setItem('evo_onboarding_v3', 'done')
        void completeOnboarding()
        setShowOnboardingComplete(true)
      } else if (onboardingInProgress) {
        // 引导未完成：保存已有对话到 localStorage，不创建节点
        const realTurns = savedTurns.filter(t => t.user?.trim())
        if (realTurns.length > 0) {
          saveOnboardingTurns(savedTurns)
        }
        // 确保画布上保留 onboarding 能力块入口
        const hasOnboarding = canvasNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
        if (!hasOnboarding) void addCapabilityNode('onboarding')
        const hasImportMemory = canvasNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
        if (!hasImportMemory) void addCapabilityNode('import-memory')
      } else {
        if (shouldSave && conversationSnapshot && conversationSnapshot.userMessage) {
          endConversation(finalResponse, savedAppliedPreferences, lastReasoning, conversationSnapshot)
            .catch(err => console.error('后台保存对话失败:', err))
        }
        // 中途退出引导（phase < 2）：补齐能力块，确保画布上始终有 import-memory 和 onboarding 入口
        if (isOnboardingMode) {
          const hasImportMemory = canvasNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
          const hasOnboarding = canvasNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
          if (!hasImportMemory) void addCapabilityNode('import-memory')
          if (!hasOnboarding) void addCapabilityNode('onboarding')
        }
      }
    }, 500)
  }, [isClosing, turns, errorMessage, isStreaming, currentConversation, isOnboardingMode,
      endConversation, closeModal, appliedPreferences, completeOnboarding, addCapabilityNode, canvasNodes, saveOnboardingTurns])

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        if (editingIndex !== null) setEditingIndex(null)
        else handleClose()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isModalOpen, handleClose, editingIndex])

  // 组件卸载时清理引导流式输出定时器
  useEffect(() => {
    return () => {
      if (onboardingStreamTimerRef.current) clearTimeout(onboardingStreamTimerRef.current)
    }
  }, [])

  // ── 导出 ──────────────────────────────────────────────────────────────────
  const handleExportConversation = useCallback(() => {
    const md = turns.filter(t => t.user || t.assistant).map((t, idx) =>
      [`## 对话 ${idx + 1}`, t.user ? `\n**我：** ${t.user}` : '', t.assistant ? `\n\n**AI：**\n\n${t.assistant}` : ''].join('')
    ).join('\n\n---\n\n')
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `anima-chat-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }, [turns])

  const handleExportAll = useCallback(async () => {
    try {
      const resp = await fetch('/api/storage/export')
      if (!resp.ok) return
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anima-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
    setShowExportMenu(false)
  }, [])

  if (!isModalOpen && !showOnboardingComplete) return null

  return (
    <>
      <AnimatePresence>
        {isModalOpen && (
          <>
            {/* 遮罩 */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/30"
              animate={{ opacity: isClosing ? 0 : 1 }}
              transition={{ duration: 0.4 }}
              aria-hidden
              onClick={handleClose}
            />

            {/* 关闭动画：仅对新内容生效，跳过纯回放 */}
            <AnimatePresence>
              {isClosing && !isReplayRef.current && didMutateRef.current && (
                <ClosingAnimation isOnboarding={isOnboardingMode} appliedPreferences={appliedPreferences} />
              )}
            </AnimatePresence>

            {/* 对话框主体 */}
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
                {/* 头部 */}
                <div className="flex items-center justify-end px-6 py-3 border-b border-gray-100 bg-white gap-2">
                  {/* 引导模式提示（未完成时显示） */}
                  {isOnboardingMode && !onboardingDone && (
                    <span className="flex-1 text-[12px] text-gray-400 font-medium pl-1">
                      随时可以关闭，下次点击「新手教程」继续
                    </span>
                  )}
                  {/* 导出菜单 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(v => !v)}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {showExportMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          className="absolute right-0 top-full mt-1 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-10"
                          onMouseLeave={() => setShowExportMenu(false)}
                        >
                          <button onClick={handleExportConversation} className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Download className="w-3.5 h-3.5 text-gray-400" />导出对话 (MD)
                          </button>
                          <div className="h-px bg-gray-50 mx-3" />
                          <button onClick={handleExportAll} className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Download className="w-3.5 h-3.5 text-gray-400" />导出全量数据 (JSON)
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* X 按钮（引导阶段有 pulse 提示） */}
                  <motion.button
                    onClick={handleClose}
                    animate={showXPulse
                      ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0 0 rgba(0,0,0,0)', '0 0 0 6px rgba(0,0,0,0.08)', '0 0 0 0 rgba(0,0,0,0)'] }
                      : {}
                    }
                    transition={showXPulse ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : {}}
                    className={`p-2 rounded-full transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${showXPulse ? 'ring-2 ring-gray-200' : ''}`}
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* 对话内容区 */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth space-y-8">
                  <div className="max-w-2xl mx-auto space-y-10">
                    {turns.map((t, idx) => (
                      <div key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* 用户消息 + 文件气泡 */}
                        <div className="flex justify-end mb-6">
                          <div className="flex flex-col items-end gap-1 max-w-[85%] group/usermsg">
                            {t.images && t.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 justify-end">
                                {t.images.map((img, i) => (
                                  <img key={i} src={img} className="w-32 h-32 object-cover rounded-2xl border border-gray-100 shadow-sm" />
                                ))}
                              </div>
                            )}
                            {t.files && t.files.filter(f => !f.preview).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 justify-end">
                                {t.files.filter(f => !f.preview).map(file => (
                                  <FileBubble key={file.id} file={file} />
                                ))}
                              </div>
                            )}

                            {t.user && (
                              <div className="bg-[#F4F4F4] rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed text-gray-900 min-w-[60px] max-w-full">
                                {editingIndex === idx ? (
                                  <div className="flex flex-col gap-2">
                                    <textarea
                                      value={editingContent}
                                      onChange={e => setEditingContent(e.target.value)}
                                      className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm outline-none"
                                      rows={3} autoFocus
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() }
                                        if (e.key === 'Escape') setEditingIndex(null)
                                      }}
                                    />
                                    <div className="flex justify-end gap-2 text-xs">
                                      <button onClick={() => setEditingIndex(null)} className="opacity-70 hover:opacity-100">取消</button>
                                      <button onClick={handleSaveEdit} className="font-bold hover:underline">保存</button>
                                    </div>
                                  </div>
                                ) : <div>{t.user}</div>}
                              </div>
                            )}

                            {t.memories && t.memories.length > 0 && (
                              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 justify-end">
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full border border-gray-200 text-gray-600 text-[11px] font-medium">
                                  <Layers className="w-3 h-3 flex-shrink-0" />
                                  <span>引用了 {t.memories.length} 条记忆：</span>
                                  <span className="opacity-75 truncate max-w-[140px]">{t.memories[0].conv.userMessage.slice(0, 20)}{t.memories[0].conv.userMessage.length > 20 ? '…' : ''}</span>
                                </div>
                              </motion.div>
                            )}

                            {!isStreaming && editingIndex !== idx && t.user && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/usermsg:opacity-100 transition-opacity duration-150">
                                <button onClick={() => handleStartEdit(idx, t.user)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="编辑">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button onClick={() => handleCopyMessage(t.user, idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="复制">
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
                              {t.assistant && !isStreaming && (
                                <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover/aimsg:opacity-100 transition-opacity duration-150">
                                  <button onClick={() => handleCopyMessage(t.assistant, idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="复制">
                                    {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                  {!isOnboardingMode && (
                                    <button onClick={() => handleRegenerate(idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="重新生成">
                                      <RefreshCw className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 底部输入区 */}
                <InputArea
                  feedbackMessage={feedbackMessage}
                  pendingImages={pendingImages}
                  pendingFiles={pendingFiles}
                  isStreaming={isStreaming}
                  isOnboardingMode={isOnboardingMode}
                  evolutionToast={evolutionToast}
                  fileInputRef={fileInputRef}
                  textareaRef={textareaRef}
                  onFeedbackChange={handleFeedbackChange}
                  onFeedbackSubmit={handleFeedbackSubmit}
                  onStopGeneration={handleStopGeneration}
                  onFileSelect={handleFileSelect}
                  onDrop={handleDrop}
                  onRemoveFile={removeFile}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* 引导完成弹窗（唯一弹窗阶段） */}
      <AnimatePresence>
        {showOnboardingComplete && (
          <OnboardingCompletePopup onDismiss={() => setShowOnboardingComplete(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── 关闭动画子组件（左上角轻量提示）────────────────────────────────────────────

function ClosingAnimation({ isOnboarding, appliedPreferences }: { isOnboarding: boolean; appliedPreferences: string[] }) {
  const label = isOnboarding ? '记忆已生成 ✦' : '已记下来了'
  return (
    <motion.div
      initial={{ opacity: 0, x: -8, y: -4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed top-4 left-4 z-[55] pointer-events-none flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 text-white text-[12px] font-medium rounded-2xl shadow-lg">
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {label}
      </div>
      {appliedPreferences.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-2xl shadow-md">
          <Sparkles className="w-3 h-3 text-yellow-300 flex-shrink-0" />
          已应用 {appliedPreferences.length} 条偏好
        </div>
      )}
    </motion.div>
  )
}

// ── 底部输入区子组件 ──────────────────────────────────────────────────────────

interface InputAreaProps {
  feedbackMessage: string
  pendingImages: string[]
  pendingFiles: FileAttachment[]
  isStreaming: boolean
  isOnboardingMode: boolean
  evolutionToast: { label: string; detail: string } | null
  fileInputRef: React.RefObject<HTMLInputElement>
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onFeedbackChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onFeedbackSubmit: () => void
  onStopGeneration: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  onRemoveFile: (id: string) => void
}

function InputArea({
  feedbackMessage, pendingImages, pendingFiles, isStreaming, isOnboardingMode,
  evolutionToast, fileInputRef, textareaRef,
  onFeedbackChange, onFeedbackSubmit, onStopGeneration, onFileSelect, onDrop, onRemoveFile
}: InputAreaProps) {
  return (
    <div className="p-4 bg-white border-t border-gray-100">
      <div className="max-w-2xl mx-auto relative">
        <AnimatePresence>
          {evolutionToast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute -top-14 left-0 right-0 flex justify-center"
            >
              <div className="flex flex-col items-center gap-0.5 px-4 py-2 bg-gray-900 text-white rounded-2xl shadow-lg max-w-xs text-center">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                  {evolutionToast.label}
                </div>
                {evolutionToast.detail && (
                  <div className="text-[10px] text-white/60 leading-snug truncate max-w-[220px]">{evolutionToast.detail}</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 bg-white rounded-[24px] p-2 border border-gray-200 shadow-sm focus-within:border-gray-900 transition-all relative">
          <AnimatePresence>
            {(pendingFiles.length > 0 || pendingImages.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-2 p-2 bg-white/90 backdrop-blur-md rounded-xl border border-gray-100 shadow-lg"
              >
                {pendingImages.map((img, i) => (
                  <div key={`p-img-${i}`} className="relative group w-12 h-12">
                    <img src={img} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    <button onClick={() => onRemoveFile(pendingFiles.find(f => f.preview === img)?.id || '')} className="absolute -top-1 -right-1 bg-white rounded-full shadow border p-0.5 opacity-0 group-hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {pendingFiles.filter(f => !f.preview).map(f => (
                  <div key={f.id} className="relative group flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                    <FileIcon className="w-3 h-3 text-gray-400" />
                    <span className="max-w-[80px] truncate">{f.name}</span>
                    <button onClick={() => onRemoveFile(f.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelect} multiple />

          <div className="flex-1 relative" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
            <textarea
              ref={textareaRef}
              value={feedbackMessage}
              onChange={onFeedbackChange}
              placeholder={isOnboardingMode ? '在这里介绍你自己…' : '回复…'}
              className="w-full bg-transparent border-none outline-none resize-none py-3 text-[15px] max-h-[120px]"
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onFeedbackSubmit() }
              }}
            />
          </div>

          {isStreaming ? (
            <button onClick={onStopGeneration} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md" title="停止生成">
              <Square className="w-4 h-4 animate-pulse fill-white" />
            </button>
          ) : (
            <button
              onClick={onFeedbackSubmit}
              disabled={!feedbackMessage.trim() && pendingFiles.length === 0}
              className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black disabled:opacity-40 disabled:bg-gray-200 transition-all shadow-sm"
            >
              <ArrowUp className="w-5 h-5 stroke-[3px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
