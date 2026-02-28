import { useState, useCallback, useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { useAI } from '../hooks/useAI'
import { GrayHint } from './GrayHint'
import type { PreferenceRule } from '@shared/types'

export function AnswerModal() {
  const { 
    isModalOpen, 
    currentConversation, 
    closeModal, 
    endConversation,
    detectFeedback,
    addPreference,
    getPreferencesForPrompt
  } = useCanvasStore()
  
  const [response, setResponse] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [detectedPreference, setDetectedPreference] = useState<PreferenceRule | null>(null)
  const [appliedPreferences, setAppliedPreferences] = useState<string[]>([])
  const [isClosing, setIsClosing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // AI Hook
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const { sendMessage } = useAI({
    onStream: (chunk) => {
      setResponse(prev => prev + chunk)
      setErrorMessage(null)
      // 自动滚动到底部
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    },
    onComplete: (fullText) => {
      setIsStreaming(false)
      setErrorMessage(null)
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)
    },
    onError: (error) => {
      setIsStreaming(false)
      setErrorMessage(error)
      setResponse('') // 清空失败的内容
    }
  })

  // 当模态框打开时，自动发送消息
  useEffect(() => {
    if (isModalOpen && currentConversation && !currentConversation.assistantMessage) {
      setResponse('')
      setIsStreaming(true)
      setAppliedPreferences([])
      setFeedbackMessage('')
      setDetectedPreference(null)
      
      const preferences = getPreferencesForPrompt()
      sendMessage(currentConversation.userMessage, preferences)
    }
  }, [isModalOpen, currentConversation])

  // 处理反馈输入
  const handleFeedbackChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setFeedbackMessage(value)
    
    const detected = detectFeedback(value)
    if (detected) {
      setDetectedPreference(detected)
    }
  }, [detectFeedback])

  // 提交反馈
  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackMessage.trim()) return
    
    if (detectedPreference) {
      await addPreference(detectedPreference)
    }
    
    setResponse('')
    setIsStreaming(true)
    setFeedbackMessage('')
    setDetectedPreference(null)
    
    const preferences = getPreferencesForPrompt()
    sendMessage(currentConversation?.userMessage || '', preferences)
  }, [feedbackMessage, detectedPreference, addPreference, currentConversation, getPreferencesForPrompt, sendMessage])

  // 关闭并保存（带平滑过渡）
  const handleClose = useCallback(async () => {
    setIsClosing(true)
    
    // 等待动画完成
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // 总是有对话就保存节点（即使API失败）
    if (currentConversation) {
      // 如果有回复就保存回复，否则保存错误信息
      const finalResponse = response || (errorMessage ? `[API错误: ${errorMessage}]` : '[无回复]')
      // 关闭后继续保存，避免阻塞返回画布
      void endConversation(finalResponse, appliedPreferences)
    }
    
    // 重置状态
    setResponse('')
    setErrorMessage(null)
    setFeedbackMessage('')
    setDetectedPreference(null)
    setAppliedPreferences([])
    setIsClosing(false)
    closeModal()
  }, [response, errorMessage, currentConversation, endConversation, closeModal, appliedPreferences])

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
          ) : response ? (
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
          
          {/* 用户消息 */}
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-gray-100 rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-800 text-[15px] leading-relaxed">
              {currentConversation?.userMessage}
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
                {isStreaming && (
                  <span className="flex gap-1">
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
              
              {/* AI消息内容 */}
              <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">
                {errorMessage ? (
                  // 错误状态
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span className="font-medium">API调用失败</span>
                    </div>
                    <p className="text-sm">{errorMessage}</p>
                    <p className="text-xs mt-2 text-red-500">
                      提示: 点击"返回画布"仍可保存这个问题节点，稍后配置正确的API Key后可重新提问
                    </p>
                  </div>
                ) : response ? (
                  // 正常回复
                  <div className="prose prose-gray max-w-none">
                    {response}
                  </div>
                ) : (
                  // 加载中
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span>正在思考...</span>
                  </div>
                )}
              </div>
              
              {/* 灰字提示 */}
              {appliedPreferences.length > 0 && response && !isStreaming && (
                <div className="pt-2">
                  <GrayHint preferences={appliedPreferences} />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 底部反馈区 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {!isStreaming && response && (
            <div className="space-y-3">
              {/* 反馈提示 */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>不满意？告诉AI你的想法，下次会记住</span>
              </div>
              
              {/* 反馈输入 */}
              <div className="flex gap-3">
                <textarea
                  ref={textareaRef}
                  value={feedbackMessage}
                  onChange={handleFeedbackChange}
                  placeholder="例如：简洁点、换个思路、详细一点..."
                  className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gray-200 resize-none min-h-[44px] max-h-[100px]"
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
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                  重新回答
                </button>
              </div>
              
              {/* 检测到的偏好 */}
              {detectedPreference && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600 font-medium">✓ 已记住偏好:</span>
                  <span className="text-gray-600">{detectedPreference.preference}</span>
                </div>
              )}
            </div>
          )}
          
          {/* 快捷键提示 */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <span>按 ESC 返回画布</span>
            <span>Enter 发送 · Shift+Enter 换行</span>
          </div>
        </div>
      </div>
    </div>
  )
}
