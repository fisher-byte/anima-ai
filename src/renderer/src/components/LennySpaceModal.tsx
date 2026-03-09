/**
 * LennySpaceModal — Lenny Rachitsky 公开记忆空间
 *
 * 一个以 Lenny 为原型的公开示例记忆空间，让用户体验"有记忆加持的对话"。
 * 对话历史仅保存在当前 React state（会话级），不写入用户数据库。
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Square, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getAuthToken } from '../services/storageService'
import { LENNY_SYSTEM_PROMPT } from '@shared/constants'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface LennySpaceModalProps {
  isOpen: boolean
  onClose: () => void
}

const SUGGESTED_QUESTIONS = [
  'How do I know if I have product-market fit?',
  'What\'s the best growth channel for early-stage B2B?',
  'Should I focus on retention or acquisition first?',
  'How do you think about pricing a new product?',
]

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

export function LennySpaceModal({ isOpen, onClose }: LennySpaceModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // 关闭时停止流式
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort()
    }
  }, [isOpen])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
    // 清理正在流式输出的消息标记
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setInput('')

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    const assistantMsgId = `assistant-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    // 构建历史（不含当前正在生成的助手消息）
    const history = [...messages, userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      const res = await authFetch('/api/ai/stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: history,
          preferences: [],
          systemPromptOverride: LENNY_SYSTEM_PROMPT,
        }),
        signal,
      })

      if (!res.ok) {
        const errText = res.status === 400
          ? 'API Key 未配置，请先在设置中填写 API Key'
          : `请求失败（${res.status}）`
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: errText, isStreaming: false } : m
        ))
        setIsStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let sseBuffer = ''
      let fullContent = ''

      while (true) {
        if (signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          try {
            const parsed = JSON.parse(dataLine.slice(6))
            if (parsed.type === 'content' && parsed.content) {
              fullContent += parsed.content
              const captured = fullContent
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: captured } : m
              ))
            } else if (parsed.type === 'done') {
              const finalText = parsed.fullText ?? fullContent
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: finalText, isStreaming: false } : m
              ))
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m
        ))
      } else {
        const errMsg = err instanceof Error ? err.message : '连接出错，请重试'
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: errMsg, isStreaming: false } : m
        ))
      }
    } finally {
      setIsStreaming(false)
    }
  }, [messages, isStreaming])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }, [input, sendMessage])

  const handleSuggestedQuestion = useCallback((q: string) => {
    sendMessage(q)
  }, [sendMessage])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-gray-950"
        >
          {/* 背景渐变装饰 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
          </div>

          {/* 顶部栏 */}
          <div className="relative z-10 flex items-center gap-4 px-6 py-4 border-b border-white/5">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回我的空间</span>
            </button>

            <div className="flex-1 flex items-center justify-center gap-3">
              {/* Lenny 头像 */}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shrink-0">
                L
              </div>
              <div>
                <div className="text-white font-semibold text-sm leading-tight">Lenny Rachitsky</div>
                <div className="text-gray-400 text-xs">Product Growth · Newsletter · Podcast</div>
              </div>
            </div>

            {/* 右侧占位，保持标题居中 */}
            <div className="w-24" />
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto relative z-10">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
              {/* 欢迎卡片 */}
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-xl">
                    L
                  </div>
                  <h2 className="text-white text-xl font-semibold mb-2">Lenny's Space</h2>
                  <p className="text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">
                    Ask me anything about product, growth, PMF, pricing, or building your career.
                    <br />
                    <span className="text-gray-500 text-xs mt-1 block">Based on Lenny's Newsletter & Podcast knowledge</span>
                  </p>

                  {/* 推荐问题 */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestedQuestion(q)}
                        className="text-left text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* 消息列表 */}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* 头像 */}
                  {msg.role === 'assistant' ? (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5">
                      L
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                  )}

                  {/* 气泡 */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-white/10 text-white rounded-tr-sm'
                        : 'bg-white/5 text-gray-200 rounded-tl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:text-white prose-headings:font-semibold prose-li:my-0.5 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || (msg.isStreaming ? '▋' : '')}
                        </ReactMarkdown>
                        {msg.isStreaming && msg.content && (
                          <span className="inline-block w-0.5 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </motion.div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 底部输入区域 */}
          <div className="relative z-10 border-t border-white/5 px-4 py-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-end gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-white/20 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Lenny anything..."
                  rows={1}
                  className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm resize-none outline-none leading-relaxed max-h-32 overflow-y-auto"
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                  disabled={isStreaming}
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="w-8 h-8 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 flex items-center justify-center transition-colors shrink-0"
                    title="停止生成"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim()}
                    className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-gray-600 text-white flex items-center justify-center transition-colors shrink-0"
                    title="发送"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-center text-gray-600 text-xs mt-2">
                Based on Lenny's Newsletter & Podcast · Not affiliated with Lenny Rachitsky
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
