import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { UI_CONFIG } from '@shared/constants'
import { X, Paperclip } from 'lucide-react'

export function InputBox() {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { startConversation, isModalOpen } = useCanvasStore()

  // 处理图片文件读取
  const handleFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    
    if (imageFiles.length === 0) return

    imageFiles.forEach(file => {
      if (file.size > MAX_SIZE) {
        alert(`图片 "${file.name}" 超过 5MB，请上传较小的图片。`)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (result) {
          setImages(prev => [...prev, result].slice(0, 4)) // 最多支持4张图片
        }
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed && images.length === 0) return
    
    startConversation(trimmed, images)
    setMessage('')
    setImages([])
    
    // 重置textarea高度
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = 'auto'
      }
    })
  }, [message, images, startConversation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter发送，Shift+Enter换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    
    // 自动调整高度
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [])

  // 当模态框打开时，隐藏输入框
  if (isModalOpen) return null

  return (
    <div 
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 图片预览区 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-white/50 backdrop-blur-md rounded-xl border border-white/20">
          {images.map((img, idx) => (
            <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              <img src={img} className="w-full h-full object-cover" />
              <button 
                onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
          className="p-3 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="上传图片"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
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
          disabled={!message.trim() && images.length === 0}
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
        按 Enter 发送，Shift + Enter 换行
      </div>
    </div>
  )
}
