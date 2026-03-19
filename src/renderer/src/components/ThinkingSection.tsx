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
 *
 * 性能优化（v0.5.39）：
 *   - ThinkingSection 整体用 memo() + 自定义 equality 包裹，避免 parent 高频
 *     setState（每个 SSE token）导致不必要的 re-render。
 *   - ThinkingMarkdown 单独 memo 隔离 ReactMarkdown 的重量级解析，仅在 content
 *     字符串真实变化时重新渲染。这是"点击展开后卡死"的根治修复：展开
 *     ThinkingSection 时 ReactMarkdown 只需解析一次，后续 parent re-render
 *     不再重新解析数千字的 reasoning 文本。
 */
import { useState, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT } from '../i18n'

const THINK_MIN_LEN = 50

interface ThinkingSectionProps {
  content: string
  isStreaming: boolean
  isWaiting?: boolean   // true = 已发送，等待第一个 token（无思考内容）
  forceCollapsed?: boolean
}

/**
 * ThinkingMarkdown — 仅在 content 实际变化时重新解析。
 *
 * ReactMarkdown + remark-gfm 对大段文本（>2KB）的 parse 是同步且重量级的操作。
 * 若不隔离，每次 AnswerModal 的 setState（每个 SSE token、每次点击）都会触发
 * 所有历史轮次的 ReactMarkdown 重新解析 → 主线程卡死 → 点击无响应。
 */
const ThinkingMarkdown = memo(function ThinkingMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {content || '...'}
    </ReactMarkdown>
  )
})

function ThinkingSectionInner({ content, isStreaming, isWaiting, forceCollapsed }: ThinkingSectionProps) {
  const { t } = useT()
  const [isExpanded, setIsExpanded] = useState(() => !(forceCollapsed ?? false))
  const [dot, setDot] = useState(0)

  /** 根据 thinking 内容长度返回当前思考阶段标签 */
  function getThinkingLabel(c: string): string {
    const len = c.length
    if (len < 200) return t.thinking.analyzing
    if (len < 800) return t.thinking.deepReasoning
    return t.thinking.fullThinking
  }

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
          {t.thinking.waiting + '.'.repeat(dot + 1)}
        </span>
      </motion.div>
    )
  }

  if (!content && !isStreaming) return null
  if (content && content.length < THINK_MIN_LEN && !isStreaming) return null

  // 思考完毕时的摘要信息（字数）
  const doneLabel = !isStreaming && content
    ? t.thinking.doneSummary(content.length)
    : t.thinking.done

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
              <ThinkingMarkdown content={content} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * ThinkingSection — memo 包裹，自定义 equality：
 * 仅在 props 实际变化时重新渲染，拦截来自 AnswerModal 高频 setState 的无效更新。
 *
 * 关键：isStreaming=false（输出完毕）后，ThinkingSection 的所有 props 均不再变化，
 * 因此点击 AnswerModal 内任何按钮（导致 parent re-render）都不会重新渲染本组件，
 * 也不会触发 ThinkingMarkdown 重新解析 reasoning 文本。
 */
export const ThinkingSection = memo(ThinkingSectionInner, (prev, next) => {
  return (
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.isWaiting === next.isWaiting &&
    prev.forceCollapsed === next.forceCollapsed
  )
})
