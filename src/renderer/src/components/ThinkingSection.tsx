import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const THINK_MIN_LEN = 50

interface ThinkingSectionProps {
  content: string
  isStreaming: boolean
  forceCollapsed?: boolean
}

export function ThinkingSection({ content, isStreaming, forceCollapsed }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => !(forceCollapsed ?? false))

  useEffect(() => {
    if (forceCollapsed) setIsExpanded(false)
  }, [forceCollapsed])

  if (!content && !isStreaming) return null
  if (content && content.length < THINK_MIN_LEN && !isStreaming) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors group"
      >
        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <span className="font-medium tracking-tight uppercase">
          {isStreaming ? '正在思考中...' : '已完成思考'}
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
            <div className="mt-2 pl-4 border-l-2 border-gray-200/60 bg-gray-50/50 rounded-r-lg text-sm text-gray-500 leading-relaxed italic">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || (isStreaming ? '...' : '')}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
