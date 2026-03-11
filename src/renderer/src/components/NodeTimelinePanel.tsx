/**
 * NodeTimelinePanel — 节点时间线面板
 *
 * 当节点包含多条合并对话时，点击节点打开此面板展示垂直时间线。
 * 样式复用 NodeDetailPanel 的右侧抽屉布局。
 */
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, MessageSquare, Plus } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { storageService } from '../services/storageService'
import { STORAGE_FILES } from '@shared/constants'
import type { Conversation } from '@shared/types'
import { useT } from '../i18n'

export function NodeTimelinePanel() {
  const { t } = useT()
  const timelineNodeId = useCanvasStore(state => state.timelineNodeId)
  const nodes = useCanvasStore(state => state.nodes)
  const closeNodeTimeline = useCanvasStore(state => state.closeNodeTimeline)
  const openModalById = useCanvasStore(state => state.openModalById)
  const startConversation = useCanvasStore(state => state.startConversation)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const node = timelineNodeId ? nodes.find(n => n.id === timelineNodeId) : null
  const conversationIds = node ? (node.conversationIds ?? [node.conversationId]) : []

  useEffect(() => {
    if (!node || conversationIds.length === 0) return

    setIsLoading(true)
    storageService.read(STORAGE_FILES.CONVERSATIONS)
      .then(content => {
        if (!content) { setConversations([]); return }
        const idSet = new Set(conversationIds)
        const convMap = new Map<string, Conversation>()
        for (const line of content.trim().split('\n').filter(Boolean)) {
          try {
            const conv = JSON.parse(line) as Conversation
            if (conv.id && idSet.has(conv.id)) convMap.set(conv.id, conv)
          } catch { /* ignore */ }
        }
        // 按 conversationIds 顺序（时间升序）排列
        const sorted = conversationIds
          .map(id => convMap.get(id))
          .filter((c): c is Conversation => !!c)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        setConversations(sorted)
      })
      .catch(() => setConversations([]))
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineNodeId])

  const handleContinue = useCallback(() => {
    if (!node) return
    closeNodeTimeline()
    startConversation('', [], [], node.id)
  }, [node, closeNodeTimeline, startConversation])

  const handleOpenConv = useCallback((convId: string) => {
    closeNodeTimeline()
    openModalById(convId)
  }, [closeNodeTimeline, openModalById])

  if (!node) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-4 bottom-4 right-4 w-[360px] z-40 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="relative bg-white border-b border-gray-100/80 p-6">
        <button
          onClick={closeNodeTimeline}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
        </button>

        {node.category && (
          <div className="mb-2">
            <span
              className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
              style={{
                backgroundColor: node.color?.replace('0.9', '0.15') || 'rgba(226,232,240,0.15)',
                color: '#374151',
                borderColor: node.color?.replace('0.9', '0.3') || 'rgba(226,232,240,0.3)'
              }}
            >
              {node.topicLabel ?? node.category}
            </span>
          </div>
        )}

        <h2 className="text-lg font-bold text-gray-900 leading-snug pr-8">{node.title}</h2>

        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t.nodeTimeline.conversations(conversationIds.length)}</span>
          {node.firstDate && <span>{t.nodeTimeline.since(node.firstDate)}</span>}
        </div>
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">{t.nodeTimeline.loading}</div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">{t.nodeTimeline.noRecords}</div>
        ) : (
          conversations.map((conv, idx) => {
            const date = conv.createdAt ? conv.createdAt.split('T')[0] : ''
            const preview = conv.userMessage.slice(0, 60).replace(/\n/g, ' ')
            const isLast = idx === conversations.length - 1
            return (
              <div key={conv.id} className="flex gap-3">
                {/* Timeline track */}
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                  {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                </div>

                <button
                  onClick={() => handleOpenConv(conv.id)}
                  className="flex-1 text-left pb-4 group"
                >
                  <div className="text-[10px] text-gray-400 mb-0.5">{date}</div>
                  <div className="text-[13px] text-gray-700 group-hover:text-gray-900 transition-colors line-clamp-2">
                    {preview || t.nodeTimeline.noContent}
                  </div>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer: 续话按钮 */}
      <div className="border-t border-gray-100/80 p-4">
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.nodeTimeline.continue}
        </button>
      </div>
    </motion.div>
  )
}
