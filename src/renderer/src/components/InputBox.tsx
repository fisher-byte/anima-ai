import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { useCanvasStore } from '../stores/canvasStore'
import { UI_CONFIG } from '@shared/constants'
import { X, Paperclip, FileText, FileCode, File as FileIcon, Loader2, ArrowUp, Command, Sparkles } from 'lucide-react'
import { formatFilesForAI, FilePreview, getFileType, readImageAsBase64, formatFileSize } from '../../../services/fileParsing'
import type { FileAttachment } from '@shared/types'

export function InputBox() {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [focused, setFocused] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { startConversation, isModalOpen, detectIntent, getRelevantMemories, setHighlight } = useCanvasStore()
  
  // Semantic Highlight State
  const [matchCount, setMatchCount] = useState(0)
  
  // Debounced Intent Detection
  useEffect(() => {
      const timer = setTimeout(async () => {
          if (!message.trim()) {
              setMatchCount(0)
              setHighlight(null, [])
              return
          }
          
          // 1. Detect Intent -> Highlight Category
          const category = detectIntent(message)
          
          // 2. Find Relevant Memories -> Count & Highlight
          const memories = await getRelevantMemories(message)
          setMatchCount(memories.length)
          
          // Trigger Canvas Highlight
          const highlightedIds = memories.map(m => m.conv.id)
          setHighlight(category, highlightedIds)
          
      }, 300)
      return () => clearTimeout(timer)
  }, [message, detectIntent, getRelevantMemories, setHighlight])

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

          // 创建文件附件
          const attachment: FileAttachment = {
            id: previewId,
            name: file.name,
            type: file.type,
            size: file.size,
            content,
            preview
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
    const files: File[] = []

    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile()
      if (file) files.push(file)
    }

    if (files.length > 0) {
      e.preventDefault()
      handleFiles(files)
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
    setFiles(prev => prev.filter(f => f.id !== id))

    // 同时移除对应的图片
    const file = files.find(f => f.id === id)
    if (file?.preview) {
      setImages(prev => prev.filter(img => img !== file.preview))
    }
  }, [files])

  // 移除图片
  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // 提交
  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    const hasImages = images.length > 0
    const hasFiles = files.length > 0

    if (!trimmed && !hasImages && !hasFiles) return

    // 组合用户消息和文件内容
    let fullMessage = trimmed
    if (hasFiles) {
      const fileContext = formatFilesForAI(files.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        content: f.content || ''
      })))
      fullMessage = trimmed + fileContext
    }

    startConversation(fullMessage, images, files)

    // 清空状态
    setMessage('')
    setImages([])
    setFiles([])
    setFilePreviews([])

    // 重置textarea高度
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = 'auto'
      }
    })
  }, [message, images, files, startConversation])

  // 键盘处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // 自动调整高度
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

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

  return (
    <LayoutGroup>
        <motion.div
        layoutId="container"
        initial={{ opacity: 0, y: 20, x: "-50%" }}
        animate={{ opacity: 1, y: 0, x: "-50%" }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed bottom-12 left-1/2 z-50 w-full max-w-2xl px-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
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

        <motion.div 
            layout
            className={`
            relative flex items-end gap-1.5 rounded-[28px] 
            bg-white/80 backdrop-blur-2xl p-2.5 
            border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] 
            ring-1 ring-black/5 transition-all duration-300
            ${focused ? 'scale-[1.02] shadow-[0_25px_60px_rgba(0,0,0,0.12)] ring-blue-200' : ''}
            `}
        >
            <div className="flex items-center justify-center w-10 h-10 mb-1.5 rounded-full bg-gray-50 text-gray-400">
                <Command className="w-5 h-5" />
            </div>

            <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="mb-1.5 p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 rounded-xl transition-all disabled:opacity-50"
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
            placeholder={UI_CONFIG.INPUT_PLACEHOLDER}
            className="flex-1 bg-transparent border-none outline-none resize-none px-2 py-3.5 text-gray-800 placeholder-gray-400 min-h-[52px] max-h-[220px] text-[15px] leading-relaxed"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold mr-1 whitespace-nowrap"
                >
                    <Sparkles className="w-3 h-3" />
                    <span>{matchCount} 记忆</span>
                </motion.div>
                )}
            </AnimatePresence>

            <button
            onClick={handleSubmit}
            disabled={(!message.trim() && images.length === 0 && files.length === 0) || isProcessing}
            className={`mb-1 p-2.5 rounded-2xl transition-all duration-300 flex items-center justify-center shadow-lg transform active:scale-95 ${
            (!message.trim() && images.length === 0 && files.length === 0) || isProcessing
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 ring-4 ring-blue-50'
            }`}
            aria-label="发送"
            >
            <ArrowUp className="w-5 h-5 stroke-[3px]" />
            </button>
        </motion.div>

        {/* 快捷键提示 */}
        <div className="flex justify-center gap-4 mt-3 text-[10px] text-gray-300 font-bold uppercase tracking-widest pointer-events-none">
            <span className="bg-gray-50 px-2 py-0.5 rounded border border-gray-100">Enter Send</span>
            <span className="bg-gray-50 px-2 py-0.5 rounded border border-gray-100">Shift + Enter Newline</span>
        </div>
        </motion.div>
    </LayoutGroup>
  )
}
