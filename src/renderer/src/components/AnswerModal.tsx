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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // AI Hook
  const { sendMessage } = useAI({
    onStream: (chunk) => {
      setResponse(prev => prev + chunk)
    },
    onComplete: (fullText) => {
      setIsStreaming(false)
      // 检测是否应用了偏好
      const prefs = getPreferencesForPrompt()
      setAppliedPreferences(prefs)
    },
    onError: (error) => {
      setIsStreaming(false)
      setResponse(prev => prev + '\n\n[错误: ' + error + ']')
    }
  })

  // 当模态框打开时，自动发送消息
  useEffect(() => {
    if (isModalOpen && currentConversation && !currentConversation.assistantMessage) {
      setResponse('')
      setIsStreaming(true)
      setAppliedPreferences([])
      
      // 获取历史偏好并发送
      const preferences = getPreferencesForPrompt()
      sendMessage(currentConversation.userMessage, preferences)
    }
  }, [isModalOpen, currentConversation])

  // 处理反馈输入
  const handleFeedbackChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setFeedbackMessage(value)
    
    // 实时检测负反馈
    const detected = detectFeedback(value)
    if (detected) {
      setDetectedPreference(detected)
    }
  }, [detectFeedback])

  // 提交反馈
  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackMessage.trim()) return
    
    // 如果检测到偏好，保存它
    if (detectedPreference) {
      await addPreference(detectedPreference)
    }
    
    // 重新生成回答
    setResponse('')
    setIsStreaming(true)
    setFeedbackMessage('')
    setDetectedPreference(null)
    
    const preferences = getPreferencesForPrompt()
    sendMessage(currentConversation?.userMessage || '', preferences)
  }, [feedbackMessage, detectedPreference, addPreference, currentConversation, getPreferencesForPrompt, sendMessage])

  // 关闭并保存
  const handleClose = useCallback(async () => {
    if (response && currentConversation) {
      await endConversation(response, appliedPreferences)
    }
    setResponse('')
    setFeedbackMessage('')
    setDetectedPreference(null)
    setAppliedPreferences([])
    closeModal()
  }, [response, currentConversation, endConversation, closeModal, appliedPreferences])

  if (!isModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-white animate-fade-in">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <button
          onClick={handleClose}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>返回画布</span>
        </button>
        
        {isStreaming && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>AI 正在回答...</span>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* 左侧：对话 */}
        <div className="flex-1 flex flex-col max-w-3xl mx-auto px-6 py-6 overflow-hidden">
          {/* 用户问题 */}
          <div className="mb-6">
            <div className="text-sm text-gray-400 mb-2">你的问题</div>
            <div className="text-lg text-gray-800 font-medium">
              {currentConversation?.userMessage}
            </div>
          </div>

          {/* AI回答 */}
          <div className="flex-1 overflow-y-auto">
            <div className="text-sm text-gray-400 mb-2">AI回答</div>
            <div className="prose prose-gray max-w-none">
              {response ? (
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {response}
                </div>
              ) : (
                <div className="text-gray-400 italic">等待AI回复...</div>
              )}
            </div>
            
            {/* 灰字提示 */}
            {appliedPreferences.length > 0 && response && !isStreaming && (
              <GrayHint preferences={appliedPreferences} />
            )}
          </div>

          {/* 反馈区 */}
          {!isStreaming && response && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="text-sm text-gray-500 mb-3">
                不满意？直接告诉AI你的想法（例如："简洁点"、"换个思路"）
              </div>
              <div className="flex gap-3">
                <textarea
                  ref={textareaRef}
                  value={feedbackMessage}
                  onChange={handleFeedbackChange}
                  placeholder="输入反馈，AI会记住你的偏好..."
                  className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gray-200 resize-none"
                  rows={2}
                />
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackMessage.trim()}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  重新回答
                </button>
              </div>
              
              {/* 检测到的偏好提示 */}
              {detectedPreference && (
                <div className="mt-2 text-xs text-green-600">
                  检测到偏好：{detectedPreference.preference}
                  {detectedPreference.confidence > 0.6 && '（已记录）'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
