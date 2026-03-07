/**
 * ThinkingSection — AI 思考过程折叠展示
 *
 * 职责：在对话回复中渲染 AI 的 thinking/reasoning 内容，支持折叠/展开。
 *
 * 状态（分阶段）：
 *   isWaiting=true + content=''  → 三点跳动 + "正在思考..."（等待首个 token）
 *   isStreaming=true + content<200   → "正在分析..."  + 蓝色脉冲
 *   isStreaming=true + content<800   → "深度推理中..."  + 蓝色脉冲
 *   isStreaming=true + content>=800  → "全力思考中..."  + 蓝色脉冲
 *   isStreaming=false              → "思考完毕" + 字数摘要
 *
 * 注意：thinking 内容完整持久化（endConversation 时随 turns 一起存储），
 * 历史对话回放时可完整查看每轮思考过程。
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const THINK_MIN_LEN = 50

interface ThinkingSectionProps {
  content: string
  isStreaming: boolean
  isWaiting?: boolean   // true = 已发送，等待第一个 token（无思考内容）
  forceCollapsed?: boolean
}

/** 根据 thinking 内容长度返回当前思考阶段标签 */
function getThinkingLabel(content: string): string {
  const len = content.length
  if (len < 200) return '正在分析...'
  if (len < 800) return '深度推理中...'
  return '全力思考中...'
}

export function ThinkingSection({ content, isStreaming, isWaiting, forceCollapsed }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => !(forceCollapsed ?? false))
  const [dot, setDot] = useState(0)

  useEffect(() => {
    if (forceCollapsed) {
      setIsExpanded(false)
    } else if (!forceCollapsed) {
      // 当 forceCollapsed 从 true 变回 false 时，恢复展开（仅 isWaiting/isStreaming 状态下）
      if (isWaiting || isStreaming) setIsExpanded(true)
    }
  }, [forceCollapsed, isWaiting, isStreaming])

  // 三点跳动动画（%3 循环，避免全暗帧）
  useEffect(() => {
    if (!isStreaming && !isWaiting) return
    const id = setInterval(() => setDot(d => (d + 1) % 3), 420)
    return () => { clearInterval(id); setDot(0) }
  }, [isStreaming, isWaiting])

  // 等待第一个 token 时：显示专属加载状态，不可折叠
  if (isWaiting && !content) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center gap-2.5"
      >
        {/* 三点跳动动画 */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-gray-400"
              animate={{ y: dot === i ? -3 : 0, opacity: dot === i ? 1 : 0.4 }}
              transition={{ duration: 0.2 }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400 font-medium tracking-wide">
          {'正在思考' + '.'.repeat(dot + 1)}
        </span>
      </motion.div>
    )
  }

  if (!content && !isStreaming) return null
  if (content && content.length < THINK_MIN_LEN && !isStreaming) return null

  // 思考完毕时的摘要信息（字数）
  const doneLabel = !isStreaming && content
    ? `思考完毕 · ${content.length} 字`
    : '思考完毕'

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors group"
      >
        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="font-medium tracking-wide">
          {isStreaming
            ? <span className="flex items-center gap-1.5">
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"
                />
                {getThinkingLabel(content)}
              </span>
            : doneLabel}
        </span>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l-2 border-blue-100 bg-blue-50/40 rounded-r-lg text-sm text-gray-500 leading-relaxed italic">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || '...'}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

