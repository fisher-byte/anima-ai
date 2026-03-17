/**
 * AnswerModal — 对话交互主窗口（全屏模态）
 *
 * 职责：管理单次对话的完整生命周期——从用户发送消息到 AI 流式回复，再到对话存储。
 *
 * 核心流程：
 *   用户输入 → [澄清层检查] → doSend → useAI.streamAI (SSE)
 *   → turns 累积 → endConversation → canvasStore 节点生成
 *
 * 关键状态：
 *   turns[]            — 当前对话所有轮次（含 thinking/content/searchRound）
 *   isStreaming         — SSE 流是否进行中
 *   clarifyPending     — 澄清层触发时暂存原始输入
 *   pendingFiles[]     — 待发送的文件附件
 *   pendingReferenceBlocks[] — 粘贴的长文本引用块
 *
 * 子组件（来自 AnswerModalSubcomponents.tsx）：
 *   UserMessageContent / ReferenceBlockBubble / ClosingAnimation / InputArea
 *
 * 特殊模式：
 *   isOnboardingMode — 新手引导流程，使用固定脚本回复，不调用真实 AI
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Copy, RefreshCw,
  X, Layers, Download, MoreHorizontal
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import type { FileAttachment, Conversation, DecisionTrace } from '@shared/types'
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
  buildAIHistory,
} from '../utils/conversationUtils'
import { getAuthToken } from '../services/storageService'
import { buildLingSiDecisionPayload, ensureLingSiStorageSeeded, loadDecisionUnits, mergeDecisionTrace } from '../services/lingsi'
import { FEEDBACK_TRIGGERS, LENNY_SYSTEM_PROMPT, PG_SYSTEM_PROMPT, ZHANG_SYSTEM_PROMPT, WANG_SYSTEM_PROMPT } from '@shared/constants'
import {
  UserMessageContent,
  ClosingAnimation,
  InputArea,
  LingSiTracePanel,
} from './AnswerModalSubcomponents'
import { injectLingSiInlineCitations, resolveDecisionUnitLabels } from '../utils/lingsiTrace'
import { useT } from '../i18n'

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

/** 从用户自我介绍消息中提取姓名/职业关键词，用于 toast 展示 */
function extractUserInfo(message: string): string {
  // 允许名字中包含空格（如英文名），直到遇到中文标点或句末
  const nameMatch = message.match(/(?:我(?:叫|是|名(?:字)?叫?)|叫做?)\s*([^，,。！!？?\n]{1,20}?)(?:\s*[，,。！!？?\n]|$|(?:，|,|。|是|在|做|负责))/)
  const roleKeywords = ['产品', '设计', '开发', '工程师', '经理', '创业', '学生', '运营', '市场', '销售', '研究', '咨询', '教师', '医生', '律师', '写作', '创作']
  const foundRole = roleKeywords.find(k => message.includes(k))
  const parts: string[] = []
  const name = nameMatch?.[1]?.trim()
  if (name) parts.push(`名字：${name}`)
  if (foundRole) parts.push(`职业方向：${foundRole}`)
  return parts.join('，')  // 没有有效信息时返回空字符串，不兜底显示原始消息
}

export function AnswerModal() {
  const { t } = useT()
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const currentConversation = useCanvasStore(state => state.currentConversation)
  const closeModal = useCanvasStore(state => state.closeModal)
  const endConversation = useCanvasStore(state => state.endConversation)
  const updateConversation = useCanvasStore(state => state.updateConversation)
  const getPreferencesForPrompt = useCanvasStore(state => state.getPreferencesForPrompt)
  const getRelevantMemories = useCanvasStore(state => state.getRelevantMemories)
  const setConversationHistory = useCanvasStore(state => state.setConversationHistory)
  const setHighlight = useCanvasStore(state => state.setHighlight)
  const focusNode = useCanvasStore(state => state.focusNode)
  const isLoading = useCanvasStore(state => state.isLoading)
  const isOnboardingMode = useCanvasStore(state => state.isOnboardingMode)
  const completeOnboarding = useCanvasStore(state => state.completeOnboarding)
  const addCapabilityNode = useCanvasStore(state => state.addCapabilityNode)
  const onboardingResumeTurns = useCanvasStore(state => state.onboardingResumeTurns)
  const saveOnboardingTurns = useCanvasStore(state => state.saveOnboardingTurns)
  const isLennyMode = useCanvasStore(state => state.isLennyMode)
  const isPGMode = useCanvasStore(state => state.isPGMode)
  const isZhangMode = useCanvasStore(state => state.isZhangMode)
  const isWangMode = useCanvasStore(state => state.isWangMode)
  const lennyDecisionMode = useCanvasStore(state => state.lennyDecisionMode)
  const isCustomSpaceMode = useCanvasStore(state => state.isCustomSpaceMode)
  const activeCustomSpaceId = useCanvasStore(state => state.activeCustomSpaceId)
  const customSpaces = useCanvasStore(state => state.customSpaces)
  const isPureLennySpace = isLennyMode && !isPGMode && !isZhangMode && !isWangMode

  const [turns, setTurns] = useState<Turn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [evolutionToast, setEvolutionToast] = useState<{ label: string; detail: string } | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [searchRoundMsg, setSearchRoundMsg] = useState<string | null>(null)
  const [deepSearchState, setDeepSearchState] = useState<{
    taskId: number | null
    status: 'pending' | 'running' | 'done' | 'failed'
    message?: string
    progress?: string | null
  } | null>(null)
  const deepSearchStateRef = useRef<typeof deepSearchState>(null)
  // 调研前澄清层
  const [clarifyPending, setClarifyPending] = useState<string | null>(null)   // 触发澄清时暂存原始输入
  const [clarifyCustom, setClarifyCustom] = useState('')
  const evolutionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackToastCountRef = useRef(0) // 单对话内偏好学习 Toast 计数，最多 2 次
  const showToast = useCallback((label: string, detail: string, duration = 4000) => {
    if (evolutionToastTimerRef.current) clearTimeout(evolutionToastTimerRef.current)
    setEvolutionToast({ label, detail })
    evolutionToastTimerRef.current = setTimeout(() => setEvolutionToast(null), duration)
  }, [])

  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const [pendingReferenceBlocks, setPendingReferenceBlocks] = useState<string[]>([])
  const [showXPulse, setShowXPulse] = useState(false)
  const [showOnboardingComplete, setShowOnboardingComplete] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [decisionUnitLabels, setDecisionUnitLabels] = useState<string[]>([])
  const lastDeepSearchContextRef = useRef<{
    conversationId?: string
    messages: AIMessage[]
    preferences: string[]
    compressedMemory?: string
    systemPromptOverride?: string
    extraContext?: string
    isOnboarding?: boolean
  } | null>(null)
  const networkHandoffOnceRef = useRef<string | null>(null) // 避免同一 convId 重复转后台
  const autoSavedSigRef = useRef<string | null>(null)

  const serializeTurnsForStorage = useCallback((ts: Turn[]) => {
    const stillStreaming = false
    return ts.length > 0
      ? ts
          .map((t, idx) => {
            const isLastTurn = idx === ts.length - 1
            const a = t.error
              ? `[API错误: ${t.error}]`
              : (t.assistant || (isLastTurn && stillStreaming ? '[正在生成中...]' : '[无回复]'))
            const reasoning = t.reasoning ? `思考：${t.reasoning}\n\n[/THINKING]\n\n` : ''
            return `#${idx + 1}\n用户：${t.user || ''}\nAI：\n${reasoning}${a}`
          })
          .join('\n\n')
      : '[无回复]'
  }, [])

  const buildLennyDecisionRequest = useCallback(async (userMessage: string) => {
    if (!isPureLennySpace) {
      return { extraContext: undefined, decisionTrace: { mode: 'normal' as const } }
    }

    await ensureLingSiStorageSeeded()
    const currentMode = lennyDecisionMode
    const payload = await buildLingSiDecisionPayload(userMessage, currentMode)

    if (currentConversation?.id) {
      await updateConversation(currentConversation.id, {
        decisionTrace: mergeDecisionTrace(currentConversation.decisionTrace, payload.decisionTrace),
      })
    }

    return payload
  }, [currentConversation, isPureLennySpace, lennyDecisionMode, updateConversation])

  const autoSaveIfNeeded = useCallback(async () => {
    try {
      if (!currentConversation?.id) return
      if (isLennyMode || isCustomSpaceMode) return
      if (isOnboardingMode) return
      if (isStreaming) return

      const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)
      if (!shouldSave) return

      const assistantMessage = serializeTurnsForStorage(turns)
      const sig = `${currentConversation.id}:${turns.length}:${assistantMessage.length}`
      if (autoSavedSigRef.current === sig) return
      autoSavedSigRef.current = sig

      // 用 store 的 appendConversation 写入 conversations.jsonl（同 id 追加覆盖），并触发索引/画像等后续任务
      const convToSave: Conversation = {
        ...currentConversation,
        assistantMessage,
        reasoning_content: turns.length > 0 ? (turns[turns.length - 1].reasoning || undefined) : undefined,
        appliedPreferences: [...appliedPreferences],
      }
      await useCanvasStore.getState().appendConversation(convToSave)
    } catch (e) {
      console.warn('autosave failed:', e)
    }
  }, [currentConversation, isLennyMode, isCustomSpaceMode, isOnboardingMode, isStreaming, turns, appliedPreferences, serializeTurnsForStorage])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const onboardingPhaseRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedConversationIdRef = useRef<string | null>(null)
  const isReplayRef = useRef(false)
  const didMutateRef = useRef(false)
  const onboardingStreamTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onboardingStreamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onboardingStreamTimerRef3 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeDecisionTrace: DecisionTrace | undefined = currentConversation?.decisionTrace
  const shouldShowLingSiTrace =
    !!activeDecisionTrace &&
    activeDecisionTrace.mode === 'decision' &&
    isPureLennySpace &&
    ((activeDecisionTrace.sourceRefs?.length ?? 0) > 0 || decisionUnitLabels.length > 0)

  const renderAssistantMarkdown = useCallback((assistant: string, turnIndex: number) => {
    const base = stripLeadingNumberHeading(assistant || (isStreaming && turnIndex === turns.length - 1 ? '...' : ''))
    if (
      turnIndex !== turns.length - 1 ||
      !shouldShowLingSiTrace ||
      !activeDecisionTrace?.sourceRefs?.length
    ) {
      return base
    }
    return injectLingSiInlineCitations(base, activeDecisionTrace.sourceRefs)
  }, [activeDecisionTrace?.sourceRefs, isStreaming, shouldShowLingSiTrace, turns.length])

  useEffect(() => {
    let cancelled = false
    const matchedIds = currentConversation?.decisionTrace?.matchedDecisionUnitIds
    if (!matchedIds?.length) {
      setDecisionUnitLabels([])
      return
    }

    ;(async () => {
      const units = await loadDecisionUnits()
      if (cancelled) return
      setDecisionUnitLabels(resolveDecisionUnitLabels(matchedIds, units))
    })()

    return () => {
      cancelled = true
    }
  }, [currentConversation?.decisionTrace?.matchedDecisionUnitIds])

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
        let uploadError: string | undefined
        try {
          const formData = new FormData()
          formData.append('file', rawFile)
          formData.append('id', id)
          formData.append('textContent', f.content || '')
          // 绑定当前对话 ID，确保文件可被检索时关联到正确对话
          const convId = currentConversation?.id
          if (convId) formData.append('convId', convId)
          const uploadRes = await authFetch('/api/storage/file', { method: 'POST', body: formData })
          if (!uploadRes.ok) {
            uploadError = uploadRes.status === 413 ? t.modal.fileTooBig : t.modal.uploadFailed(uploadRes.status)
          }
        } catch {
          uploadError = t.modal.uploadNetworkError
        }

        const attachment: FileAttachment = {
          id, name: f.name, type: f.type, size: f.size, content: f.content, preview: f.preview,
          ...(uploadError ? { uploadError } : {})
        }
        if (f.preview) newImages.push(f.preview)
        newFiles.push(attachment)
      }))

      setPendingImages(prev => [...prev, ...newImages].slice(0, 4))
      setPendingFiles(prev => [...prev, ...newFiles].slice(0, 8))
    } catch (error) {
      console.error('File upload failed:', error)
    }
  }, [currentConversation])

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
      if (!chunk) return  // A-2: 空 chunk 防御，避免 reasoning='' 导致 isWaiting ghost 状态
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
    onSearchRound: (_round, message) => {
      setSearchRoundMsg(message)
    },
    onDeepSearch: (taskId, message, status) => {
      const next = { taskId, status: status ?? 'running', message }
      deepSearchStateRef.current = next
      setDeepSearchState(next)
      setSearchRoundMsg(message || '深度搜索已转入后台继续运行…')
      // 立即给用户一个“可退出”的确定反馈（不刷屏：3秒后自动消失）
      showToast('深度搜索后台继续', '你可以先关闭窗口，稍后回来查看结果', 3200)
    },
    onComplete: () => {
      setIsStreaming(false)
      // 回答完成即自动保存：避免“没点×直接刷新导致消息丢失”
      void autoSaveIfNeeded()
      // 若深度搜索已转入后台，不清空提示条；让用户看到“仍在进行中”
      if (!deepSearchStateRef.current || (deepSearchStateRef.current.status !== 'pending' && deepSearchStateRef.current.status !== 'running')) {
        setSearchRoundMsg(null)
      }
      setErrorMessage(null)
      didMutateRef.current = true
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)

      if (prefs.length >= 2 && !isReplayRef.current) {
        showToast('✦ 进化基因生效', t.modal.evolutionActive(prefs.length))
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
      didMutateRef.current = true

      // 网络型失败：自动转后台 deep_search（不要求用户手动重发）
      const isNetworkErr =
        typeof error === 'string' && (
          error.includes('网络连接中断') ||
          error.toLowerCase().includes('fetch') ||
          error.toLowerCase().includes('network')
        )
      const convId = currentConversation?.id
      const ctx = lastDeepSearchContextRef.current

      if (isNetworkErr && convId && ctx && ctx.conversationId === convId && networkHandoffOnceRef.current !== convId) {
        networkHandoffOnceRef.current = convId
        authFetch('/api/ai/deep-search', {
          method: 'POST',
          body: JSON.stringify({
            conversationId: convId,
            messages: ctx.messages,
            preferences: ctx.preferences,
            compressedMemory: ctx.compressedMemory,
            isOnboarding: ctx.isOnboarding ?? false,
            systemPromptOverride: ctx.systemPromptOverride,
            extraContext: ctx.extraContext,
          })
        }).then(async (r) => {
          if (!r.ok) {
            return
          }
          const data = await r.json() as { ok: boolean; taskId?: number; status?: string }
          setErrorMessage(null)
          setDeepSearchState({ taskId: data.taskId ?? null, status: (data.status as any) ?? 'pending', message: '网络中断，已转入后台深度搜索继续运行…' })
          setSearchRoundMsg('网络中断，已转入后台深度搜索继续运行…（无需重发）')
          showToast('已转后台继续', '网络恢复后会自动回写结果', 3500)
          // 清掉 turn.error，避免整屏红字覆盖
          setTurns(prev => {
            if (!prev.length) return prev
            const next = [...prev]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, error: undefined }
            return next
          })
        }).catch(() => {})
        return
      }

      // 非网络错误：保持原逻辑
      setErrorMessage(error)
      setDeepSearchState(null)
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
      setErrorMessage(t.modal.stopGeneration)
      didMutateRef.current = true
    }
  })

  // 刷新/关闭页面时记录（用于定位“未点关闭就刷新导致未保存”的情况）
  useEffect(() => {
    const handler = () => {
      // 关键兜底：刷新/离开时尝试 keepalive 保存（不依赖用户点 ×）
      try {
        if (isModalOpen && currentConversation?.id && !isStreaming && !isLennyMode && !isCustomSpaceMode && !isOnboardingMode) {
          const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)
          if (shouldSave) {
            const assistantMessage = serializeTurnsForStorage(turns)
            const sig = `${currentConversation.id}:${turns.length}:${assistantMessage.length}`
            if (autoSavedSigRef.current !== sig) {
              autoSavedSigRef.current = sig
              const token = getAuthToken()
              const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
              if (token) headers['Authorization'] = `Bearer ${token}`
              const convToSave: Conversation = {
                ...currentConversation,
                assistantMessage,
                reasoning_content: turns.length > 0 ? (turns[turns.length - 1].reasoning || undefined) : undefined,
                appliedPreferences: [...appliedPreferences],
              }
              fetch('/api/storage/conversations.jsonl/append', {
                method: 'POST',
                headers,
                body: JSON.stringify(convToSave),
                keepalive: true
              }).catch(() => {})
            }
          }
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isModalOpen, currentConversation, isStreaming, turns, appliedPreferences, isLennyMode, isCustomSpaceMode, isOnboardingMode, serializeTurnsForStorage])

  useEffect(() => {
    deepSearchStateRef.current = deepSearchState
  }, [deepSearchState])

  /** 澄清层确认后发送消息的统一入口 */
  const sendClarifiedMessage = useCallback(async (msg: string) => {
    setClarifyPending(null)
    setClarifyCustom('')
    setFeedbackMessage('')
    setIsStreaming(true)
    const memories = await getRelevantMemories(msg)
    const category = memories[0]?.category ?? null
    const highlightedNodeIds = memories.map((m: { nodeId?: string; conv: { id: string } }) => m.nodeId ?? m.conv.id).filter((id: string | undefined): id is string => id != null)
    setHighlight(category, highlightedNodeIds)
    const compressed = compressMemoriesForPrompt(memories)
    const history = buildAIHistory(turns)
    setTurns(prev => [...prev, { user: msg, assistant: '', images: [] }])
    const prefs = getPreferencesForPrompt()
    didMutateRef.current = true
    // 记录本次请求上下文，便于“关闭窗口→后台继续深度搜索”
    lastDeepSearchContextRef.current = {
      conversationId: currentConversation?.id,
      messages: [...history, { role: 'user', content: msg }] as any,
      preferences: prefs,
      compressedMemory: compressed,
      isOnboarding: false,
    }
    sendMessage(msg, prefs, history, [], compressed, false, currentConversation?.id)
  }, [getRelevantMemories, setHighlight, compressMemoriesForPrompt, turns, getPreferencesForPrompt, sendMessage, currentConversation])

  // ── 加载状态：重置本地状态，避免显示上一个对话的内容 ──────────────────────
  useEffect(() => {
    if (isLoading) {
      setTurns([])
      setIsStreaming(false)
      setErrorMessage(null)
    }
  }, [isLoading])

  // ── 新手引导：打开时注入问候语（或恢复已有 turns） ─────────────────────────
  useEffect(() => {
    if (!isModalOpen || !isOnboardingMode) return
    // 进入 onboarding 时清除任何残留的错误提示
    setErrorMessage(null)
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
      // 全新引导：先放空 turn，再流式输出问候语（用独立 timer，不占用 isStreaming 状态，允许用户随时打字）
      setTurns([{ user: '', assistant: '' }])
      onboardingPhaseRef.current = 0
      setOnboardingDone(false)
      const fullText = ONBOARDING_GREETING
      let charIndex = 0
      const scheduleGreeting = () => {
        if (charIndex >= fullText.length) {
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 80)
          return
        }
        const ch = fullText[charIndex]
        const isPunct = /[。！？…\n]/.test(ch)
        const delay = isPunct ? 100 : 22
        charIndex += 1
        const slice = fullText.slice(0, charIndex)
        setTurns([{ user: '', assistant: slice }])
        onboardingStreamTimerRef3.current = setTimeout(scheduleGreeting, delay)
      }
      onboardingStreamTimerRef3.current = setTimeout(scheduleGreeting, 300)
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
    if (!isModalOpen || !currentConversation || isOnboardingMode || isLoading) return

    const prepareConversation = async () => {
      // 对话框打开时，预加载偏好规则用于顶部预告
      const currentPrefs = getPreferencesForPrompt()
      if (currentPrefs.length > 0) setAppliedPreferences(currentPrefs)
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
        // 优先使用服务器已加载的历史（由 openModal/openModalById 异步获取）
        const serverHistory = useCanvasStore.getState().conversationHistory
        setConversationHistory(serverHistory.length > 0 ? serverHistory : history)
        setIsStreaming(false)
        setErrorMessage(null)
        setAppliedPreferences(currentConversation.appliedPreferences || [])
        startedConversationIdRef.current = currentConversation.id

        const dsStatus = currentConversation.deepSearch?.status
        const hasDeepSearchPending = dsStatus === 'pending' || dsStatus === 'running' ||
          (currentConversation.assistantMessage || '').includes('[深度搜索进行中...]')
        if (!hasDeepSearchPending && finalTurns.length === 1 && (
          !finalTurns[0].assistant ||
          finalTurns[0].assistant.includes('[正在生成中...]') ||
          finalTurns[0].assistant.includes('[无回复]')
        )) {
          handleRegenerate(0, finalTurns)
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

      const preferences = (isLennyMode || isCustomSpaceMode) ? [] : getPreferencesForPrompt()
      // Lenny/PG/Custom Space 模式：不传 conversationId（避免持久化到用户 conversation_history），使用对应 persona 的 system prompt
      if (isCustomSpaceMode) {
        const activeSpace = customSpaces.find(s => s.id === activeCustomSpaceId)
        const spacePrompt = activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT
        sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images, compressed, false, undefined, spacePrompt)
      } else if (isLennyMode) {
        const spacePrompt = isPGMode ? PG_SYSTEM_PROMPT : isZhangMode ? ZHANG_SYSTEM_PROMPT : isWangMode ? WANG_SYSTEM_PROMPT : LENNY_SYSTEM_PROMPT
        const decisionPayload = await buildLennyDecisionRequest(currentConversation.userMessage)
        sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images, compressed, false, undefined, spacePrompt, decisionPayload.extraContext)
      } else {
        sendMessage(currentConversation.userMessage, preferences, [], currentConversation.images, compressed, false, currentConversation.id)
        lastDeepSearchContextRef.current = {
          conversationId: currentConversation.id,
          messages: [{ role: 'user', content: currentConversation.userMessage }] as any,
          preferences,
          compressedMemory: compressed,
          isOnboarding: false,
        }
      }
    }

    prepareConversation()
  }, [isModalOpen, currentConversation, isOnboardingMode, isLoading, resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories, isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, customSpaces, activeCustomSpaceId, buildLennyDecisionRequest])

  // ── 深度搜索后台任务轮询：可跨页面继续，完成后回写到当前节点 ────────────────
  useEffect(() => {
    if (!isModalOpen) return
    if (!currentConversation?.id) return
    if (isLennyMode || isCustomSpaceMode) return

    const convId = currentConversation.id
    const ds = currentConversation.deepSearch
    const shouldPoll = (deepSearchState?.status === 'pending' || deepSearchState?.status === 'running') ||
      (ds?.status === 'pending' || ds?.status === 'running')
    if (ds?.status === 'pending' || ds?.status === 'running') {
      setDeepSearchState(prev => prev?.status === 'pending' || prev?.status === 'running'
        ? prev
        : { taskId: ds.taskId, status: ds.status, message: '深度搜索后台进行中…' })
      setSearchRoundMsg('深度搜索后台进行中…（可关闭窗口，稍后回来查看）')
    }
    if (!shouldPoll) return

    let cancelled = false
    const tick = async () => {
      try {
        const resp = await authFetch(`/api/ai/deep-search/status/${convId}`)
        if (!resp.ok) return
        const data = await resp.json() as {
          ok: boolean
          exists?: boolean
          status?: 'pending' | 'running' | 'done' | 'failed'
          taskId?: number
          progress?: string | null
          result?: { content?: string; reasoning?: string | null } | null
          error?: string | null
        }
        if (cancelled || !data.ok || !data.exists) return

        const status = data.status ?? 'running'
        setDeepSearchState(prev => ({
          taskId: data.taskId ?? prev?.taskId ?? null,
          status,
          message: prev?.message,
          progress: data.progress ?? prev?.progress ?? null
        }))
        if (status === 'pending' || status === 'running') {
          const msg = data.progress || '深度搜索后台进行中…（可关闭窗口）'
          setSearchRoundMsg(msg)
          return
        }

        if (status === 'failed') {
          setSearchRoundMsg(`深度搜索失败：${data.error || '未知原因'}`)
          showToast('深度搜索失败', '你可以点击“重试”或重新生成', 4500)
          setDeepSearchState(prev => prev ? { ...prev, status: 'failed' } : { taskId: data.taskId ?? null, status: 'failed' })
          return
        }

        // done：回写内容到 UI
        const content = data.result?.content?.trim() ?? ''
        const reasoning = data.result?.reasoning ?? undefined
        if (content) {
          setTurns(prev => {
            if (!prev.length) return prev
            const next = [...prev]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, assistant: content, reasoning: reasoning ?? last.reasoning, error: undefined }
            return next
          })
          setSearchRoundMsg(null)
          showToast('深度搜索完成', '结果已更新到当前节点', 3200)
          await updateConversation(convId, {
            assistantMessage: content,
            reasoning_content: typeof reasoning === 'string' ? reasoning : undefined,
            deepSearch: { taskId: data.taskId ?? 0, status: 'done', finishedAt: new Date().toISOString() }
          })
        } else {
          setSearchRoundMsg('深度搜索已完成，但未生成正文输出。')
        }
        setDeepSearchState(prev => prev ? { ...prev, status: 'done' } : { taskId: data.taskId ?? null, status: 'done' })
      } catch { /* ignore */ }
    }

    // 立刻 tick 一次 + 每 3 秒轮询
    void tick()
    const id = setInterval(() => { void tick() }, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isModalOpen, currentConversation?.id, currentConversation?.deepSearch?.status, deepSearchState?.status, isLennyMode, isCustomSpaceMode, updateConversation, showToast])

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
    const preferences = (isLennyMode || isCustomSpaceMode) ? [] : getPreferencesForPrompt()
    if (isCustomSpaceMode) {
      const activeSpace = customSpaces.find(s => s.id === activeCustomSpaceId)
      const spacePrompt = activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT
      sendMessage(newContent, preferences, history, currentTurn.images, undefined, undefined, undefined, spacePrompt)
    } else if (isLennyMode) {
      const spacePrompt = isPGMode ? PG_SYSTEM_PROMPT : isZhangMode ? ZHANG_SYSTEM_PROMPT : isWangMode ? WANG_SYSTEM_PROMPT : LENNY_SYSTEM_PROMPT
      const decisionPayload = await buildLennyDecisionRequest(newContent)
      sendMessage(newContent, preferences, history, currentTurn.images, undefined, undefined, undefined, spacePrompt, decisionPayload.extraContext)
    } else {
      sendMessage(newContent, preferences, history, currentTurn.images, undefined, undefined, currentConversation.id)
    }
  }

  const handleStopGeneration = useCallback(() => { cancel() }, [cancel])

  const handleRegenerate = useCallback(async (index: number, sourceTurns?: Turn[]) => {
    if (!currentConversation) return
    const baseTurns = sourceTurns ?? turns
    const previousTurns = baseTurns.slice(0, index)
    const currentTurn = baseTurns[index]
    if (!currentTurn?.user) return
    const history = buildAIHistory(previousTurns)
    const newTurns = [...previousTurns, { user: currentTurn.user, assistant: '', images: currentTurn.images, files: currentTurn.files }]
    setTurns(newTurns)
    setIsStreaming(true)
    const preferences = (isLennyMode || isCustomSpaceMode) ? [] : getPreferencesForPrompt()
    if (isCustomSpaceMode) {
      const activeSpace = customSpaces.find(s => s.id === activeCustomSpaceId)
      const spacePrompt = activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT
      sendMessage(currentTurn.user, preferences, history, currentTurn.images, undefined, undefined, undefined, spacePrompt)
    } else if (isLennyMode) {
      const spacePrompt = isPGMode ? PG_SYSTEM_PROMPT : isZhangMode ? ZHANG_SYSTEM_PROMPT : isWangMode ? WANG_SYSTEM_PROMPT : LENNY_SYSTEM_PROMPT
      const decisionPayload = await buildLennyDecisionRequest(currentTurn.user)
      sendMessage(currentTurn.user, preferences, history, currentTurn.images, undefined, undefined, undefined, spacePrompt, decisionPayload.extraContext)
    } else {
      sendMessage(currentTurn.user, preferences, history, currentTurn.images, undefined, undefined, currentConversation.id)
    }
  }, [turns, currentConversation, sendMessage, getPreferencesForPrompt, isLennyMode, isCustomSpaceMode, customSpaces, activeCustomSpaceId, isPGMode, isZhangMode, isWangMode, buildLennyDecisionRequest])

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
    const hasRefs = pendingReferenceBlocks.length > 0
    if ((!trimmed && !hasImages && !hasFiles && !hasRefs) || isStreaming) return

    // ── 调研前澄清：规则触发 ──────────────────────────────────────────────
    // 满足：含调研关键词 + 无明确对象（无专有名词/引号/数字/英文词）+ 非引导模式 + 非 lenny 模式
    const RESEARCH_KEYWORDS = ['调研', '研究', '深度分析', '深入分析', '帮我查', '帮我搜', '查一下', '搜一下', '了解一下', '分析一下']
    const hasResearchKw = RESEARCH_KEYWORDS.some(kw => trimmed.includes(kw))
    // 有明确对象的特征：含引号、数字年份、英文单词、或比较长且有具体名词
    const hasConcreteTarget = /[""「」『』]/.test(trimmed) ||          // 引号内容
      /\d{4}/.test(trimmed) ||                                        // 年份数字
      /[a-zA-Z]{3,}/.test(trimmed) ||                                 // 英文词（产品名等）
      trimmed.length > 20                                             // 超过 20 字视为已足够具体
    if (!isOnboardingMode && !isLennyMode && hasResearchKw && !hasConcreteTarget && !clarifyPending) {
      setClarifyPending(trimmed)
      return
    }

    // 拼接引用块到消息体
    let fullTrimmed = trimmed
    if (hasRefs) {
      const refSection = pendingReferenceBlocks
        .map(r => `[REFERENCE_START]\n${r}\n[REFERENCE_END]`)
        .join('\n')
      fullTrimmed = trimmed + (trimmed ? '\n\n' : '') + refSection
    }

    // 偏好检测改走后端 Agent（fire-and-forget），不再前端关键词判断
    // 注意：新手引导 phase2 在下方有专用的 extract_preference 调用（使用更准确的 assistant 上下文），此处跳过避免重复
    // Lenny 模式：不提取用户偏好（Lenny 对话不影响用户画像）
    const isOnboardingPhase2 = isOnboardingMode && onboardingPhaseRef.current === 2
    if (trimmed.length >= 5 && !isOnboardingPhase2 && !isLennyMode) {
      const lastAssistant = turns.length > 0 ? (turns[turns.length - 1].assistant || '') : ''
      authFetch('/api/memory/queue', {
        method: 'POST',
        body: JSON.stringify({
          type: 'extract_preference',
          payload: { userMessage: trimmed, assistantMessage: lastAssistant.slice(0, 300) }
        })
      }).catch(() => {})

      // 即时反馈：检测到偏好触发词时，立刻告知用户「好的，我记住了。」
      if (feedbackToastCountRef.current < 2) {
        const lower = trimmed.toLowerCase()
        const hasFeedbackTrigger = FEEDBACK_TRIGGERS.some(t => t.keywords.some(k => lower.includes(k.toLowerCase())))
        if (hasFeedbackTrigger) {
          feedbackToastCountRef.current += 1
          showToast(t.modal.gotIt, '', 2500)
        }
      }
    }

    setFeedbackMessage('')
    setPendingImages([])
    setPendingFiles([])
    setPendingReferenceBlocks([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ── 引导 phase 2：用户给出风格反馈 → Agent 后台提取 + 流式输出 GENE_SAVED ──
    if (isOnboardingMode && onboardingPhaseRef.current === 2) {
      onboardingPhaseRef.current = 3
      setIsStreaming(true)
      setTurns(prev => [...prev, { user: fullTrimmed, assistant: '' }])
      showToast(t.modal.geneRecorded, trimmed.slice(0, 45))

      const fullText = ONBOARDING_GENE_SAVED
      let charIndex = 0
      const scheduleNext2 = () => {
        if (charIndex >= fullText.length) {
          setIsStreaming(false)
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 100)
          return
        }
        const ch = fullText[charIndex]
        const isPunct = /[。！？…\n]/.test(ch)
        const delay = isPunct ? 100 : 22
        charIndex += 1
        const slice = fullText.slice(0, charIndex)
        setTurns(prev => {
          if (!prev.length) return prev
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], assistant: slice }
          return next
        })
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        onboardingStreamTimerRef2.current = setTimeout(scheduleNext2, delay)
      }
      onboardingStreamTimerRef2.current = setTimeout(scheduleNext2, 400)

      // 方案A：引导 phase2 完成后触发进化基因提取（后台 fire-and-forget）
      authFetch('/api/memory/queue', {
        method: 'POST',
        body: JSON.stringify({
          type: 'extract_preference',
          payload: { userMessage: trimmed, assistantMessage: ONBOARDING_GENE_SAVED.slice(0, 300), context: 'onboarding_phase2' }
        })
      }).catch(() => {})
      return
    }

    // phase 0：模拟流式输出预设样例回复，不调 AI，完成后跳到 phase 2 等待风格反馈
    if (isOnboardingMode && onboardingPhaseRef.current === 0) {
      onboardingPhaseRef.current = 2
      setIsStreaming(true)
      setTurns(prev => [...prev, { user: fullTrimmed, assistant: '' }])

      const fullText = ONBOARDING_DEFAULT_RESPONSE
      let charIndex = 0

      // 方案A：引导 phase0 完成后触发用户画像提取（fire-and-forget）
      authFetch('/api/memory/queue', {
        method: 'POST',
        body: JSON.stringify({
          type: 'extract_profile',
          payload: { userMessage: trimmed, assistantMessage: ONBOARDING_DEFAULT_RESPONSE.slice(0, 300), context: 'onboarding_phase0' }
        })
      }).catch(() => {})

      // 短暂"思考"停顿后再开始输出
      const scheduleNext = () => {
        if (charIndex >= fullText.length) {
          setIsStreaming(false)
          const infoDetail = extractUserInfo(trimmed)
          if (infoDetail) {
            showToast(t.modal.profileUpdated, infoDetail, 4000)
          } else {
            showToast(t.modal.backgroundAnalysis, '', 2500)
          }
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

    // Lenny 模式：跳过用户记忆检索，不高亮节点，直接用 Lenny 历史对话记忆
    let memories: Awaited<ReturnType<typeof getRelevantMemories>> = []
    let compressed: string | undefined
    if (!isLennyMode) {
      memories = await getRelevantMemories(trimmed)
      const category = memories[0]?.category ?? null
      const highlightedNodeIds = memories
        .map(m => m.nodeId ?? m.conv.id)
        .filter((id): id is string => id != null)
      setHighlight(category, highlightedNodeIds)
      if (highlightedNodeIds.length > 0) focusNode(highlightedNodeIds[0])
      compressed = compressMemoriesForPrompt(memories)
    } else {
      // Lenny 模式：从 lenny-conversations.jsonl 检索历史对话记忆（不高亮节点）
      memories = await getRelevantMemories(trimmed)
      compressed = compressMemoriesForPrompt(memories)
    }

    let fullMessage = fullTrimmed
    if (hasFiles) {
      fullMessage += formatFilesForAI(pendingFiles.map(f => ({
        name: f.name, type: f.type, size: f.size, content: f.content || ''
      })))
    }

    // Bug fix: 历史中跳过空 user 的预设引导轮次，避免空消息传入 AI
    const history = buildAIHistory(turns)
    const currentTurn: Turn = {
      user: fullTrimmed,
      assistant: '',
      images: pendingImages,
      files: pendingFiles,
      memoryCategory: memories[0]?.category,
      memories: memories.length > 0 ? memories : undefined
    }
    setTurns(prev => [...prev, currentTurn])

    const preferences = (isLennyMode || isCustomSpaceMode) ? [] : getPreferencesForPrompt()
    didMutateRef.current = true
    // Custom Space / Lenny/PG 模式：传 systemPromptOverride + 历史记忆压缩，不传 conversationId（避免写用户历史）
    if (isCustomSpaceMode) {
      const activeSpace = customSpaces.find(s => s.id === activeCustomSpaceId)
      const spacePrompt = activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT
      sendMessage(fullMessage, preferences, history, pendingImages, compressed, false, undefined, spacePrompt)
    } else if (isLennyMode) {
      const spacePrompt = isPGMode ? PG_SYSTEM_PROMPT : isZhangMode ? ZHANG_SYSTEM_PROMPT : isWangMode ? WANG_SYSTEM_PROMPT : LENNY_SYSTEM_PROMPT
      const decisionPayload = await buildLennyDecisionRequest(fullTrimmed)
      sendMessage(fullMessage, preferences, history, pendingImages, compressed, false, undefined, spacePrompt, decisionPayload.extraContext)
    } else {
      // 记录上下文，便于“关闭窗口→后台继续深度搜索”
      lastDeepSearchContextRef.current = {
        conversationId: currentConversation?.id,
        messages: [...history, { role: 'user', content: fullMessage }] as any,
        preferences,
        compressedMemory: compressed,
        isOnboarding: isOnboardingMode,
      }
      sendMessage(fullMessage, preferences, history, pendingImages, compressed, isOnboardingMode, isOnboardingMode ? undefined : currentConversation?.id)
    }
  }, [feedbackMessage, pendingImages, pendingFiles, pendingReferenceBlocks, isStreaming, isOnboardingMode, isLennyMode, isPGMode, isZhangMode, isWangMode,
      isCustomSpaceMode, activeCustomSpaceId, customSpaces,
      getPreferencesForPrompt, sendMessage, turns, getRelevantMemories, setHighlight, focusNode, buildLennyDecisionRequest])

  // ── 关闭并保存 ────────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (isClosing) return
    feedbackToastCountRef.current = 0 // 重置偏好学习 Toast 计数
    const shouldSave = !!currentConversation && (!isReplayRef.current || didMutateRef.current)

    let conversationSnapshot = currentConversation
    if (isOnboardingMode && conversationSnapshot && conversationSnapshot.userMessage === '') {
      const firstRealTurn = turns.find(t => t.user?.trim())
      if (firstRealTurn) {
        conversationSnapshot = { ...conversationSnapshot, userMessage: firstRealTurn.user }
      }
    }

    // 若仍在生成中：将本次对话“转入后台深度搜索”，然后再关闭窗口
    // 目标：用户退出后继续跑，完成后再回来能看到“已完成”。
    let handedOffToDeepSearch = false
    if (isStreaming && currentConversation?.id && !isLennyMode && !isCustomSpaceMode) {
      try {
        const ctx = lastDeepSearchContextRef.current
        const fallbackHistory = buildAIHistory(turns)
        const payload = {
          conversationId: currentConversation.id,
          messages: (ctx?.conversationId === currentConversation.id ? ctx.messages : [...fallbackHistory, { role: 'user', content: turns[turns.length - 1]?.user || currentConversation.userMessage }]) as any,
          preferences: (ctx?.conversationId === currentConversation.id ? ctx.preferences : getPreferencesForPrompt()),
          compressedMemory: (ctx?.conversationId === currentConversation.id ? ctx.compressedMemory : undefined),
          isOnboarding: isOnboardingMode,
          systemPromptOverride: (ctx?.conversationId === currentConversation.id ? ctx.systemPromptOverride : undefined),
          extraContext: (ctx?.conversationId === currentConversation.id ? ctx.extraContext : undefined),
        }
        const resp = await authFetch('/api/ai/deep-search', { method: 'POST', body: JSON.stringify(payload) })
        if (resp.ok) {
          const data = await resp.json() as { ok: boolean; taskId?: number; status?: string }
          if (data.ok) {
            handedOffToDeepSearch = true
            setDeepSearchState({ taskId: data.taskId ?? null, status: (data.status as any) ?? 'pending', message: '深度搜索后台进行中…' })
            setSearchRoundMsg('深度搜索后台进行中…（你已关闭窗口也会继续）')
            // 停止前端流，避免“关窗后继续吐 token 但 UI 已清空”的浪费/丢失
            cancel()
          }
        }
      } catch { /* ignore */ }
    }

    const stillStreaming = isStreaming
    const finalResponse = turns.length > 0
      ? turns
          .map((t, idx) => {
            const isLastTurn = idx === turns.length - 1
            const a = t.error
              ? `[API错误: ${t.error}]`
              : (t.assistant || (isLastTurn && stillStreaming
                  ? (handedOffToDeepSearch ? '[深度搜索进行中...]' : '[正在生成中...]')
                  : '[无回复]'))
            const reasoning = t.reasoning ? `思考：${t.reasoning}\n\n[/THINKING]\n\n` : ''
            return `#${idx + 1}\n用户：${t.user || ''}\nAI：\n${reasoning}${a}`
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
    // P2-4: 提前捕获 isLennyMode / isPGMode / isZhangMode / isWangMode / isCustomSpaceMode，防止 close 先于 endConversation 把 flags 改为 false
    const wasLennyMode = isLennyMode
    const wasPGMode = isPGMode
    const wasZhangMode = isZhangMode
    const wasWangMode = isWangMode
    const wasCustomSpaceMode = isCustomSpaceMode
    const wasActiveCustomSpaceId = activeCustomSpaceId

    setIsClosing(true)
    // A-5: 关闭时主动清理 onboarding 流式定时器，防止资源泄漏
    if (onboardingStreamTimerRef.current) clearTimeout(onboardingStreamTimerRef.current)
    if (onboardingStreamTimerRef2.current) clearTimeout(onboardingStreamTimerRef2.current)
    if (onboardingStreamTimerRef3.current) clearTimeout(onboardingStreamTimerRef3.current)
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      setIsClosing(false)
      setTurns([])
      setErrorMessage(null)
      setFeedbackMessage('')
      setAppliedPreferences([])
      setDeepSearchState(null)
      setShowXPulse(false)
      setOnboardingDone(false)

      if (onboardingCompleted) {
        // 引导全量完成：将每段真实对话独立保存为节点
        closeModal()
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
            .catch(err => console.error('Failed to save onboarding node:', err))
        })
        localStorage.setItem('evo_onboarding_v3', 'done')
        // completeOnboarding 在下一 tick 执行，让节点保存先 enqueue（非阻塞流程，顺序即可）
        setTimeout(() => void completeOnboarding(), 0)
        // 延迟弹窗，让 closeModal 动画先完成，避免与 toast 同帧冲突
        setTimeout(() => setShowOnboardingComplete(true), 600)
      } else if (onboardingInProgress) {
        // 引导未完成：保存已有对话到 localStorage，不创建节点
        closeModal()
        const realTurns = savedTurns.filter(t => t.user?.trim())
        if (realTurns.length > 0) {
          saveOnboardingTurns(savedTurns)
        }
        // 确保画布上保留 onboarding 能力块入口
        // A-4: 用 getState() 读最新 nodes，避免 closure 快照导致重复添加能力块
        const hasOnboarding = useCanvasStore.getState().nodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
        if (!hasOnboarding) void addCapabilityNode('onboarding')
        const hasImportMemory = useCanvasStore.getState().nodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
        if (!hasImportMemory) void addCapabilityNode('import-memory')
      } else if (wasCustomSpaceMode && wasActiveCustomSpaceId) {
        // Custom Space 模式：先恢复 flags，再 await endConversation，最后 closeModal
        useCanvasStore.setState({ isCustomSpaceMode: wasCustomSpaceMode, activeCustomSpaceId: wasActiveCustomSpaceId })
        if (shouldSave && conversationSnapshot && conversationSnapshot.userMessage) {
          const realTurns = savedTurns.filter(t => t.user?.trim() || t.assistant?.trim())
          let serializedAssistant: string
          if (realTurns.length <= 1) {
            serializedAssistant = realTurns[0]?.assistant || ''
          } else {
            serializedAssistant = realTurns.map((t, i) =>
              `#${i + 1}\n用户：${t.user || ''}\nAI：${t.assistant || ''}`
            ).join('\n\n')
          }
          await endConversation(serializedAssistant, [], lastReasoning, conversationSnapshot)
            .catch(err => console.error('Failed to save Custom Space conversation:', err))
        }
        closeModal()
      } else if (wasLennyMode) {
        // P0-1: Space 模式（Lenny/PG/Zhang/Wang）：先 await endConversation 写入 space 文件，再 closeModal
        // 这样 SpaceCanvas 的节点重载 effect 触发时文件已经写完，新节点可以出现
        // P5-1: 用快照恢复 space flags，防止 250ms 内其他操作提前修改 store 状态导致写错文件
        useCanvasStore.setState({ isLennyMode: wasLennyMode, isPGMode: wasPGMode, isZhangMode: wasZhangMode, isWangMode: wasWangMode })
        if (shouldSave && conversationSnapshot && conversationSnapshot.userMessage) {
          // 多轮对话序列化：用与普通模式相同的 #N\n用户：...\nAI：... 格式，保证回放时能还原所有轮次
          const realTurns = savedTurns.filter(t => t.user?.trim() || t.assistant?.trim())
          let serializedAssistant: string
          if (realTurns.length <= 1) {
            serializedAssistant = realTurns[0]?.assistant || ''
          } else {
            serializedAssistant = realTurns.map((t, i) =>
              `#${i + 1}\n用户：${t.user || ''}\nAI：${t.assistant || ''}`
            ).join('\n\n')
          }
          await endConversation(serializedAssistant, [], lastReasoning, conversationSnapshot)
            .catch(err => console.error('Failed to save Space conversation:', err))
        }
        closeModal()
      } else {
        closeModal()
        if (shouldSave && conversationSnapshot && conversationSnapshot.userMessage) {
          endConversation(finalResponse, savedAppliedPreferences, lastReasoning, conversationSnapshot)
            .catch(err => console.error('Failed to save conversation in background:', err))
        }
        // 中途退出引导（phase < 2）：补齐能力块，确保画布上始终有 import-memory 和 onboarding 入口
        if (isOnboardingMode) {
          const hasImportMemory = useCanvasStore.getState().nodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
          const hasOnboarding = useCanvasStore.getState().nodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
          if (!hasImportMemory) void addCapabilityNode('import-memory')
          if (!hasOnboarding) void addCapabilityNode('onboarding')
        }
      }
    }, 500)
  }, [isClosing, turns, errorMessage, isStreaming, currentConversation, isOnboardingMode, isLennyMode, isPGMode, isZhangMode, isWangMode,
      isCustomSpaceMode, activeCustomSpaceId,
      endConversation, closeModal, appliedPreferences, completeOnboarding, addCapabilityNode, saveOnboardingTurns,
      cancel, getPreferencesForPrompt])

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
      if (onboardingStreamTimerRef2.current) clearTimeout(onboardingStreamTimerRef2.current)
      if (onboardingStreamTimerRef3.current) clearTimeout(onboardingStreamTimerRef3.current)
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
      const resp = await authFetch('/api/storage/export')
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
              className={`fixed inset-0 ${isLennyMode ? 'z-[110]' : 'z-40'} bg-black/30`}
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
            <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 ${isLennyMode ? 'z-[120]' : 'z-50'} w-full max-w-[64rem]`} onClick={e => e.stopPropagation()}>
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
                      {t.modal.onboardingHint}
                    </span>
                  )}
                  {/* 偏好预告：非引导模式下，展示最活跃的偏好规则 */}
                  {!isOnboardingMode && appliedPreferences.length > 0 && (
                    <span className="flex-1 text-[11px] text-gray-400/70 pl-1 truncate">
                      {t.modal.memorized}{appliedPreferences[0]}
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
                            <Download className="w-3.5 h-3.5 text-gray-400" />{t.modal.exportMd}
                          </button>
                          <div className="h-px bg-gray-50 mx-3" />
                          <button onClick={handleExportAll} className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors text-left">
                            <Download className="w-3.5 h-3.5 text-gray-400" />{t.modal.exportJson}
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
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="flex items-center gap-1.5">
                          {[0, 1, 2].map(i => (
                            <motion.span
                              key={i}
                              className="block w-2 h-2 rounded-full bg-gray-300"
                              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                            />
                          ))}
                        </div>
                        <span className="text-[13px] text-gray-400">{t.modal.connecting}</span>
                      </div>
                    ) : turns.map((turn, idx) => (
                      <div key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* 用户消息 + 文件气泡 */}
                        <div className="flex justify-end mb-6">
                          <div className="flex flex-col items-end gap-1 max-w-[85%] group/usermsg">
                            {turn.images && turn.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 justify-end">
                                {turn.images.map((img, i) => (
                                  <img key={i} src={img} className="w-32 h-32 object-cover rounded-2xl border border-gray-100 shadow-sm" />
                                ))}
                              </div>
                            )}
                            {turn.files && turn.files.filter(f => !f.preview).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 justify-end">
                                {turn.files.filter(f => !f.preview).map(file => (
                                  <FileBubble key={file.id} file={file} />
                                ))}
                              </div>
                            )}

                            {turn.user && (
                              <div className="bg-[#F4F4F4] rounded-3xl px-5 py-3.5 text-[15px] leading-relaxed text-gray-900 min-w-[60px] max-w-full">
                                {editingIndex === idx ? (
                                  <div className="flex flex-col gap-3">
                                    <textarea
                                      value={editingContent}
                                      onChange={e => setEditingContent(e.target.value)}
                                      className="w-full bg-transparent text-[15px] leading-relaxed text-gray-900 outline-none resize-none"
                                      style={{ minHeight: '1.5em', height: 'auto', overflow: 'hidden' }}
                                      autoFocus
                                      rows={1}
                                      onInput={e => {
                                        const el = e.currentTarget
                                        el.style.height = 'auto'
                                        el.style.height = el.scrollHeight + 'px'
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() }
                                        if (e.key === 'Escape') setEditingIndex(null)
                                      }}
                                    />
                                    <div className="flex justify-end gap-3 text-[13px]">
                                      <button onClick={() => setEditingIndex(null)} className="text-gray-400 hover:text-gray-600 transition-colors">{t.modal.cancel}</button>
                                      <button onClick={handleSaveEdit} className="bg-gray-900 text-white px-3.5 py-1 rounded-full hover:bg-black transition-colors font-medium">{t.modal.send}</button>
                                    </div>
                                  </div>
                                ) : <UserMessageContent content={turn.user} />}
                              </div>
                            )}

                            {turn.memories && turn.memories.length > 0 && (
                              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 justify-end">
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full border border-gray-200 text-gray-600 text-[11px] font-medium">
                                  <Layers className="w-3 h-3 flex-shrink-0" />
                                  <span>{t.modal.memoriesRef(turn.memories.length)}</span>
                                  <span className="opacity-75 truncate max-w-[140px]">{turn.memories[0].conv.userMessage.slice(0, 20)}{turn.memories[0].conv.userMessage.length > 20 ? '…' : ''}</span>
                                </div>
                              </motion.div>
                            )}

                            {!isStreaming && editingIndex !== idx && turn.user && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/usermsg:opacity-100 transition-opacity duration-150">
                                <button onClick={() => handleStartEdit(idx, turn.user)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title={t.modal.edit}>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button onClick={() => handleCopyMessage(turn.user, idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title={t.modal.copy}>
                                  {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* AI 回复 */}
                        <div className="flex justify-start mb-2">
                          <div className="max-w-[95%] w-full">
                            {/* 多轮搜索提示条：仅在最后一轮且正在搜索时展示 */}
                            {(isStreaming || deepSearchState?.status === 'pending' || deepSearchState?.status === 'running') &&
                              idx === turns.length - 1 && searchRoundMsg && (
                              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-600 text-[12px]">
                                <motion.span
                                  animate={{ opacity: [0.4, 1, 0.4] }}
                                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                  className="block w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"
                                />
                                {searchRoundMsg}
                              </div>
                            )}
                            <ThinkingSection
                              content={turn.reasoning || ''}
                              isStreaming={isStreaming && idx === turns.length - 1 && !turn.assistant && !!(turn.reasoning)}
                              isWaiting={isStreaming && idx === turns.length - 1 && !turn.assistant && !turn.reasoning}
                              forceCollapsed={!!turn.assistant || idx > 0}
                            />
                            <div className="text-gray-800 text-[15px] leading-7 group/aimsg">
                              {turn.error ? (
                                <div className="text-red-500 text-sm">
                                  {turn.error}
                                  {!isStreaming && (
                                    <button
                                      onClick={() => handleRegenerate(idx)}
                                      className="ml-2 inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 underline underline-offset-2"
                                    >
                                      <RefreshCw className="w-3 h-3" />{t.modal.retry ?? '重试'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="prose prose-slate max-w-none prose-sm prose-p:my-1.5 prose-headings:my-2">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {renderAssistantMarkdown(turn.assistant || '', idx)}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {turn.assistant && !isStreaming && (
                                <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover/aimsg:opacity-100 transition-opacity duration-150">
                                  <button onClick={() => handleCopyMessage(turn.assistant, idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title={t.modal.copy}>
                                    {copiedIndex === idx ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                  {!isOnboardingMode && (
                                    <button onClick={() => handleRegenerate(idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title={t.modal.regenerate}>
                                      <RefreshCw className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                              {idx === turns.length - 1 && shouldShowLingSiTrace && (
                                <LingSiTracePanel
                                  mode={activeDecisionTrace.mode}
                                  matchedUnitLabels={decisionUnitLabels}
                                  sourceRefs={activeDecisionTrace.sourceRefs ?? []}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 底部输入区 */}
                <div className="relative">
                  {/* 澄清层：浮在输入框上方 */}
                  <AnimatePresence>
                    {clarifyPending && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className="absolute bottom-full left-0 mb-2 w-full bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg p-4 z-10"
                      >
                        <p className="text-[12px] text-gray-500 mb-3">{t.modal.clarifyTitle}</p>
                        <div className="flex flex-col gap-2 mb-3">
                          {[t.modal.clarifyOpt1, t.modal.clarifyOpt2].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                const msg = `${t.modal.clarifyPrefix}${clarifyPending} — ${opt}`
                                sendClarifiedMessage(msg)
                              }}
                              className="text-left px-3 py-2 rounded-xl border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={clarifyCustom}
                            onChange={e => setClarifyCustom(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && clarifyCustom.trim()) {
                                sendClarifiedMessage(clarifyCustom.trim())
                              }
                            }}
                            placeholder={t.modal.clarifyPlaceholder}
                            className="flex-1 text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-400"
                          />
                          <button
                            onClick={() => { setClarifyPending(null); setClarifyCustom('') }}
                            className="text-[11px] text-gray-400 hover:text-gray-600 px-2"
                          >
                            {t.modal.cancel}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <InputArea
                  feedbackMessage={feedbackMessage}
                  pendingImages={pendingImages}
                  pendingFiles={pendingFiles}
                  referenceBlocks={pendingReferenceBlocks}
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
                  onAddReferenceBlock={text => setPendingReferenceBlocks(prev => [...prev, text].slice(0, 5))}
                  onRemoveReferenceBlock={i => setPendingReferenceBlocks(prev => prev.filter((_, j) => j !== i))}
                />
                </div>
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
