import { useState, useCallback, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { UI_CONFIG } from '@shared/constants'

export function InputBox() {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { startConversation, isModalOpen } = useCanvasStore()

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return
    
    startConversation(trimmed)
    setMessage('')
    
    // 重置textarea高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [message, startConversation])

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
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <div className="glass rounded-2xl p-2 flex items-end gap-2 shadow-lg">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={UI_CONFIG.INPUT_PLACEHOLDER}
          className="flex-1 bg-transparent border-none outline-none resize-none px-4 py-3 text-gray-800 placeholder-gray-400 min-h-[48px] max-h-[120px]"
          rows={1}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
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
