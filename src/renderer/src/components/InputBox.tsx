import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { UI_CONFIG } from '@shared/constants'
import { X, Paperclip, FileText, FileCode, File as FileIcon, Loader2 } from 'lucide-react'
import { formatFilesForAI, FilePreview, getFileType, readImageAsBase64, formatFileSize } from '../../../services/fileParsing'
import type { FileAttachment } from '@shared/types'

export function InputBox() {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { startConversation, isModalOpen } = useCanvasStore()

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
    <div
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 文件预览区 */}
      {(filePreviews.length > 0 || images.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-white/50 backdrop-blur-md rounded-xl border border-white/20">
          {/* 图片预览 */}
          {images.map((img, idx) => (
            <div key={`img-${idx}`} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              <img src={img} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* 文件预览 */}
          {filePreviews.map((file) => (
            <div
              key={file.id}
              className="relative group flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200"
            >
              {file.status === 'reading' ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                getFileIcon(file.type)
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">
                  {file.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {file.status === 'reading' ? '读取中...' : file.size}
                </span>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="p-0.5 text-gray-400 hover:text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-2 flex items-end gap-2 shadow-lg ring-1 ring-black/5">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="p-3 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          aria-label="上传文件"
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
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={UI_CONFIG.INPUT_PLACEHOLDER}
          className="flex-1 bg-transparent border-none outline-none resize-none px-2 py-3 text-gray-800 placeholder-gray-400 min-h-[48px] max-h-[200px]"
          rows={1}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={(!message.trim() && images.length === 0 && files.length === 0) || isProcessing}
          className="px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-sm"
          aria-label="发送"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* 快捷键提示 */}
      <div className="text-center mt-2 text-xs text-gray-400">
        按 Enter 发送，Shift + Enter 换行 · 支持拖入图片、PDF、Word、代码文件
      </div>
    </div>
  )
}
