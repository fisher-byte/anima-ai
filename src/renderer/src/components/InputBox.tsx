/**
 * InputBox — 主输入框（画布底部）
 *
 * 职责：用户发起新对话的入口，支持文字输入、文件附件、长文本引用块。
 *
 * 功能模块：
 *   - 文字输入：自适应高度 textarea，Enter 发送，Shift+Enter 换行
 *   - 文件附件：点击/拖拽上传，解析后以 FileBubble 展示
 *   - 引用块：粘贴超过 500 字的文本自动转为折叠胶囊（ReferenceBlockPreview）
 *   - API Key 检查：未配置 key 时显示"请先设置 API Key"提示条
 *   - 意图预测：输入时 detectIntent 实时计算高亮节点（画布节点高亮联动）
 *
 * 对外：通过 canvasStore.startConversation() 触发对话，
 *        通过 canvasStore.setHighlight() 控制画布高亮状态。
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCanvasStore } from '../stores/canvasStore'
import { X, Paperclip, FileText, FileCode, File as FileIcon, Loader2, ArrowUp, Sparkles, Quote, ChevronDown, ChevronUp } from 'lucide-react'
import { formatFilesForAI, FilePreview, getFileType, readImageAsBase64, formatFileSize } from '../../../services/fileParsing'
import type { FileAttachment } from '@shared/types'
import { getAuthToken, configService } from '../services/storageService'

// Ghost Text 轮换候选列表（模块级常量，避免每次渲染重新创建）
const GHOST_TEXTS = [
  '问我任何事',
  '有什么在脑子里转？',
  '最近在思考什么？',
  '把想法说给我听',
  '今天遇到什么了？',
] as const

/** 引用块胶囊：折叠展示粘贴的长文本，保留在输入框上方 */
function ReferenceBlockPreview({ content, onRemove }: { content: string; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.slice(0, 30) + (content.length > 30 ? '…' : '')
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col gap-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[13px]"
    >
      <div className="flex items-center gap-2">
        <Quote className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="flex-1 truncate">{preview}</span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-0.5 text-amber-500 hover:text-amber-700 transition-colors"
          title={expanded ? '折叠' : '展开'}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onRemove}
          className="p-0.5 text-amber-400 hover:text-red-500 transition-colors"
          title="移除引用块"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="mt-1 max-h-40 overflow-y-auto text-[12px] leading-relaxed text-amber-700 whitespace-pre-wrap border-t border-amber-200 pt-1.5">
          {content}
        </div>
      )}
    </motion.div>
  )
}

export function InputBox() {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [focused, setFocused] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [referenceBlocks, setReferenceBlocks] = useState<string[]>([])
  const [ghostIndex, setGhostIndex] = useState(0)

  // API Key 内联输入状态
  const [isApiKeyMode, setIsApiKeyMode] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyError, setApiKeyError] = useState('')
  const [isVerifyingKey, setIsVerifyingKey] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 防抖计时器：输入停止 600ms 后再检索记忆
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 每 4 秒轮换一条 ghost text（输入框聚焦或有内容时暂停）
  useEffect(() => {
    if (focused || message) return
    const timer = setInterval(() => {
      setGhostIndex(i => (i + 1) % GHOST_TEXTS.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [focused, message])

  const startConversation = useCanvasStore(state => state.startConversation)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const detectIntent = useCanvasStore(state => state.detectIntent)
  const getRelevantMemories = useCanvasStore(state => state.getRelevantMemories)
  const setHighlight = useCanvasStore(state => state.setHighlight)
  const isOnboardingMode = useCanvasStore(state => state.isOnboardingMode)
  const hasApiKey = useCanvasStore(state => state.hasApiKey)
  const apiKeyChecked = useCanvasStore(state => state.apiKeyChecked)
  const checkApiKey = useCanvasStore(state => state.checkApiKey)

  // 引导完成后检测是否需要配置 API Key
  // isOnboardingMode 从 true→false 时触发检查（completeOnboarding 已调用 checkApiKey，但防止漏掉边缘情况）
  const prevOnboardingMode = useRef(isOnboardingMode)
  useEffect(() => {
    if (prevOnboardingMode.current && !isOnboardingMode) {
      void checkApiKey()
    }
    prevOnboardingMode.current = isOnboardingMode
  }, [isOnboardingMode, checkApiKey])

  // 引导已完成 && 没有 key && 不在引导中 → 需要设置 key
  const onboardingDone = typeof localStorage !== 'undefined' && !!localStorage.getItem('evo_onboarding_v3')
  const needsApiKey = onboardingDone && apiKeyChecked && !hasApiKey && !isOnboardingMode

  // 组件卸载或 modal 打开时，清空 badge 并取消未完成的防抖
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // modal 关闭后（InputBox 重新挂载）确保 badge 归零
  useEffect(() => {
    if (!isModalOpen) {
      setMatchCount(0)
    }
  }, [isModalOpen])

  // 处理文件拖入和选择
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList)
    if (fileArray.length === 0) return

    setIsProcessing(true)

    try {
      // 创建预览列表
      const previews: FilePreview[] = fileArray.map(file => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: getFileType(file),
        size: formatFileSize(file.size),
        status: 'reading'
      }))

      setFilePreviews(prev => [...prev, ...previews].slice(0, 8)) // 最多8个文件

      // 解析每个文件
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const previewId = previews[i].id

        try {
          // 更新状态为读取中
          setFilePreviews(prev =>
            prev.map(p => p.id === previewId ? { ...p, status: 'reading' } : p)
          )

          // 文件大小限制：10 MB
          const MAX_FILE_SIZE = 10 * 1024 * 1024
          if (file.size > MAX_FILE_SIZE) {
            throw new Error(`文件 "${file.name}" 超过 10MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
          }

          const type = getFileType(file)
          let content: string | undefined
          let preview: string | undefined

          if (type === 'image') {
            // 图片直接读取为 base64
            preview = await readImageAsBase64(file)
            content = `[图片: ${file.name}]`
            setImages(prev => [...prev, preview!].slice(0, 4))
          } else {
            // 其他文件类型需要解析
            if (type === 'pdf') {
              const pdfjs = await import('pdfjs-dist')
              pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
              const arrayBuffer = await file.arrayBuffer()
              const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
              let fullText = ''
              for (let j = 1; j <= pdf.numPages; j++) {
                const page = await pdf.getPage(j)
                const textContent = await page.getTextContent()
                fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n'
              }
              content = fullText
            } else if (type === 'doc') {
              const mammoth = await import('mammoth')
              const arrayBuffer = await file.arrayBuffer()
              const result = await mammoth.extractRawText({ arrayBuffer })
              content = result.value
            } else {
              // 文本和代码文件
              content = await file.text()
            }
          }

          // 创建文件附件（convId 在提交时绑定）
          const attachment: FileAttachment = {
            id: previewId,
            name: file.name,
            type: file.type,
            size: file.size,
            content,
            preview,
            _rawFile: file // 暂存原始 File 对象，提交时上传用
          }

          setFiles(prev => [...prev, attachment])

          // 更新预览状态为完成
          setFilePreviews(prev =>
            prev.map(p =>
              p.id === previewId
                ? { ...p, status: 'done', content: content?.slice(0, 100), preview }
                : p
            )
          )
        } catch (error) {
          console.error(`解析文件 ${file.name} 失败:`, error)
          setFilePreviews(prev =>
            prev.map(p => p.id === previewId ? { ...p, status: 'error' } : p)
          )
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [])

  // 处理粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const pasteFiles: File[] = []

    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile()
      if (file) pasteFiles.push(file)
    }

    if (pasteFiles.length > 0) {
      e.preventDefault()
      handleFiles(pasteFiles)
      return
    }

    // 文本长度 > 500 字，自动识别为引用块（最多保留 5 个引用块）
    const pastedText = e.clipboardData.getData('text')
    if (pastedText.length > 500) {
      e.preventDefault()
      setReferenceBlocks(prev => [...prev, pastedText].slice(0, 5))
    }
  }, [handleFiles])

  // 处理拖放
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  // 移除文件
  const removeFile = useCallback((id: string) => {
    setFilePreviews(prev => prev.filter(f => f.id !== id))
    setFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file?.preview) {
        setImages(imgs => imgs.filter(img => img !== file.preview))
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  // 移除图片
  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // 保存 API Key：验证后写入并刷新状态
  const handleSaveApiKey = useCallback(async () => {
    const key = apiKeyInput.trim()
    if (!key || isVerifyingKey) return
    setIsVerifyingKey(true)
    setApiKeyError('')
    try {
      await configService.setApiKey(key)
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const settings = await configService.getSettings()
      const baseUrl = settings.baseUrl || 'https://api.moonshot.cn/v1'
      const res = await fetch('/api/config/verify-key', {
        method: 'POST',
        headers,
        body: JSON.stringify({ apiKey: key, baseUrl }),
        signal: AbortSignal.timeout(8000)
      })
      const result = await res.json() as { valid: boolean }
      if (result.valid) {
        await checkApiKey()
        setIsApiKeyMode(false)
        setApiKeyInput('')
      } else {
        setApiKeyError('Key 无效，请检查后重试')
      }
    } catch {
      setApiKeyError('验证超时，请检查网络')
    } finally {
      setIsVerifyingKey(false)
    }
  }, [apiKeyInput, isVerifyingKey, checkApiKey])

  // 提交：先上传文件到后端，再触发对话
  const handleSubmit = useCallback(async () => {
    // 无 key 时禁止提交
    if (needsApiKey) return

    const trimmed = message.trim()
    const hasImages = images.length > 0
    const hasFiles = files.length > 0
    const hasRefs = referenceBlocks.length > 0

    if (!trimmed && !hasImages && !hasFiles && !hasRefs) return
    if (isProcessing) return

    setIsProcessing(true)

    // 取消输入中可能未触发的防抖，避免提交后又回调 setMatchCount
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // 2. 上传文件到后端（仅非图片文件需走存储接口）
    const uploadedFiles: FileAttachment[] = []
    for (const f of files) {
      const rawFile = f._rawFile
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _rawFile, ...clean } = f
      if (!rawFile || f.preview) {
        // 图片不单独上传（base64 已在 content），直接保留
        uploadedFiles.push(clean)
        continue
      }
      try {
        const formData = new FormData()
        formData.append('file', rawFile)
        formData.append('id', f.id)
        formData.append('textContent', f.content || '')
        const token = getAuthToken()
        const uploadHeaders = new Headers()
        if (token) uploadHeaders.set('Authorization', `Bearer ${token}`)
        const res = await fetch('/api/storage/file', { method: 'POST', body: formData, headers: uploadHeaders })
        if (!res.ok) {
          uploadedFiles.push({ ...clean, uploadError: `上传失败（${res.status}）` })
        } else {
          uploadedFiles.push(clean)
        }
      } catch {
        uploadedFiles.push({ ...clean, uploadError: '网络错误，文件未能上传到记忆库' })
      }
    }

    // 3. 组合消息并启动对话
    let fullMessage = trimmed
    if (uploadedFiles.length > 0) {
      const fileContext = formatFilesForAI(uploadedFiles.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        content: f.content || ''
      })))
      fullMessage = trimmed + fileContext
    }

    // 将引用块追加到消息体，用标记包裹（AI 可读，记忆提取时剥离）
    if (referenceBlocks.length > 0) {
      const refSection = referenceBlocks
        .map(r => `[REFERENCE_START]\n${r}\n[REFERENCE_END]`)
        .join('\n')
      fullMessage = fullMessage + (fullMessage ? '\n\n' : '') + refSection
    }

    startConversation(fullMessage, images, uploadedFiles)

    // 清空状态
    setMessage('')
    setImages([])
    setFiles([])
    setFilePreviews([])
    setReferenceBlocks([])
    setMatchCount(0)
    setHighlight(null, [])
    setIsProcessing(false)

    // 重置textarea高度
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = 'auto'
      }
    })
  }, [message, images, files, referenceBlocks, isProcessing, needsApiKey, startConversation, setHighlight])

  // 键盘处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // 自动调整高度 + 输入时防抖检索记忆（badge 反馈）
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessage(val)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`

    // 清空旧防抖
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = val.trim()
    if (!trimmed) {
      setMatchCount(0)
      setHighlight(null, [])
      return
    }

    // 600ms 防抖，输入停止后才触发检索
    debounceRef.current = setTimeout(async () => {
      try {
        const category = detectIntent(trimmed)
        const memories = await getRelevantMemories(trimmed)
        setMatchCount(memories.length)
        const highlightedIds = memories
          .map(m => m.nodeId ?? m.conv.id)
          .filter((id): id is string => !!id)
        setHighlight(category, highlightedIds)
      } catch { /* ignore */ }
    }, 600)
  }, [detectIntent, getRelevantMemories, setHighlight])

  // 获取文件图标
  const getFileIcon = (type: FilePreview['type']) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-500" />
      case 'doc':
        return <FileText className="w-4 h-4 text-blue-500" />
      case 'code':
        return <FileCode className="w-4 h-4 text-purple-500" />
      default:
        return <FileIcon className="w-4 h-4 text-gray-500" />
    }
  }

  if (isModalOpen) return null

  // 需要配置 API Key 且未展开输入框 → 提示状态
  if (needsApiKey && !isApiKeyMode) {
    return (
      <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-6 z-30">
        <div className="w-full max-w-xl mx-4 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-lg border border-gray-100">
          <span className="flex-1 text-sm text-gray-400">需要配置 Kimi API Key 才能开始对话</span>
          <button
            onClick={() => setIsApiKeyMode(true)}
            className="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-black transition-colors"
          >
            设置 API Key
          </button>
        </div>
      </div>
    )
  }

  // 需要配置 API Key 且已展开输入框 → 内联输入状态
  if (needsApiKey && isApiKeyMode) {
    return (
      <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-6 z-30">
        <div className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSaveApiKey() }}
              placeholder="粘贴你的 Kimi API Key（moonshot.cn 获取，如 sk-…）"
              autoFocus
              className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-300"
            />
            <button
              onClick={() => { setIsApiKeyMode(false); setApiKeyError('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2"
            >
              取消
            </button>
            <button
              onClick={() => void handleSaveApiKey()}
              disabled={!apiKeyInput.trim() || isVerifyingKey}
              className="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-black disabled:opacity-40 transition-colors"
            >
              {isVerifyingKey ? '验证中…' : '保存'}
            </button>
          </div>
          {apiKeyError && (
            <div className="px-4 pb-3 text-xs text-red-500">{apiKeyError}</div>
          )}
        </div>
      </div>
    )
  }

  return (
      // 外层普通 div 负责 fixed 定位——Framer Motion 的 animate 不会覆盖它的 transform
      <div
        style={{ position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 50, width: '100%', maxWidth: '42rem', paddingLeft: '1rem', paddingRight: '1rem' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
      {/* 内层 motion.div 只做 opacity/y 入场动画，不含任何定位属性 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* 文件预览区 */}
        <AnimatePresence>
            {(filePreviews.length > 0 || images.length > 0) && (
            <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="flex flex-wrap gap-2 mb-3 p-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-100 shadow-xl"
            >
                {/* 图片预览 */}
                {images.map((img, idx) => (
                <motion.div
                    key={`img-${idx}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-100 shadow-sm"
                >
                    <img src={img} className="w-full h-full object-cover" />
                    <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 p-0.5 bg-black/40 backdrop-blur-md text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-black/60"
                    >
                    <X className="w-3 h-3" />
                    </button>
                </motion.div>
                ))}

                {/* 文件预览 */}
                {filePreviews.map((file) => (
                <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group flex items-center gap-2.5 px-4 py-2.5 bg-gray-50/50 rounded-xl border border-gray-100 hover:bg-white transition-colors"
                >
                    {file.status === 'reading' ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : (
                    getFileIcon(file.type)
                    )}
                    <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[120px] tracking-tight">
                        {file.name}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">
                        {file.status === 'reading' ? '解析中...' : file.size}
                    </span>
                    </div>
                    <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                    <X className="w-3 h-3" />
                    </button>
                </motion.div>
                ))}
            </motion.div>
            )}
        </AnimatePresence>

        {/* 引用块胶囊列表（粘贴超过500字时自动折叠显示） */}
        <AnimatePresence>
          {referenceBlocks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex flex-col gap-1.5 mb-2"
            >
              {referenceBlocks.map((ref, i) => (
                <ReferenceBlockPreview
                  key={i}
                  content={ref}
                  onRemove={() => setReferenceBlocks(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
            layout
            className={`
            relative flex items-end gap-1.5 rounded-[28px]
            bg-white p-2.5
            border shadow-[0_8px_30px_rgba(0,0,0,0.08)]
            transition-all duration-200
            ${focused ? 'border-gray-900 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' : 'border-gray-200'}
            `}
        >
            <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="mb-1.5 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
            title="上传文件 (图片、文档、代码)"
            >
            <Paperclip className="w-5 h-5" />
            </button>
            <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.go,.rs,.swift,.rb,.php,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={GHOST_TEXTS[ghostIndex]}
            className="flex-1 bg-transparent border-none outline-none resize-none px-2 py-3.5 text-gray-800 placeholder-gray-400 min-h-[52px] max-h-[220px] text-[15px] leading-relaxed overflow-y-auto scrollbar-none"
            style={{ scrollbarWidth: 'none' }}
            rows={1}
            autoFocus
            />

            {/* 搜索反馈 */}
            <AnimatePresence>
                {matchCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 10 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold mr-1 whitespace-nowrap"
                >
                    <Sparkles className="w-3 h-3" />
                    <span>{matchCount} 记忆</span>
                </motion.div>
                )}
            </AnimatePresence>

            <button
            onClick={handleSubmit}
            disabled={(!message.trim() && images.length === 0 && files.length === 0 && referenceBlocks.length === 0) || isProcessing}
            className={`mb-1 p-2.5 rounded-2xl transition-all duration-200 flex items-center justify-center transform active:scale-95 ${
            (!message.trim() && images.length === 0 && files.length === 0 && referenceBlocks.length === 0) || isProcessing
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-black shadow-sm'
            }`}
            aria-label="发送"
            >
            <ArrowUp className="w-5 h-5 stroke-[3px]" />
            </button>
        </motion.div>

        {/* 快捷键提示：简洁单行，减少视觉噪音 */}
        <div className="flex justify-center mt-2 text-[10px] text-gray-300 pointer-events-none select-none tracking-wide">
            Enter 发送 · Shift+Enter 换行
        </div>
      </motion.div>
      </div>
  )
}
