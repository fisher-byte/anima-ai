import { motion } from 'framer-motion'
import { X, MessageSquare, Edit, Trash2, Calendar, Tag, Check } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useMemo, useState, useRef, useEffect } from 'react'

export function NodeDetailPanel() {
  const nodes = useCanvasStore(state => state.nodes)
  const selectedNodeId = useCanvasStore(state => state.selectedNodeId)
  const selectNode = useCanvasStore(state => state.selectNode)
  const openModalById = useCanvasStore(state => state.openModalById)
  const removeNode = useCanvasStore(state => state.removeNode)
  const renameNode = useCanvasStore(state => state.renameNode)

  const node = useMemo(() =>
    nodes.find(n => n.id === selectedNodeId),
  [nodes, selectedNodeId])

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  if (!selectedNodeId || !node) return null

  const handleContinue = () => {
    openModalById(node.conversationId)
    selectNode(null)
  }

  const handleDelete = async () => {
    if (confirm('确定要删除这个节点吗？相关的对话记录也会被删除。')) {
      await removeNode(node.id)
      selectNode(null)
    }
  }

  const handleRenameStart = () => {
    setRenameValue(node.title)
    setIsRenaming(true)
  }

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.title) {
      await renameNode(node.id, trimmed)
    }
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameConfirm()
    if (e.key === 'Escape') setIsRenaming(false)
  }

  // 用关键词组成摘要提示（节点无独立 summary 字段，keywords 已是精华）
  const summary = useMemo(() => {
    if (node.keywords && node.keywords.length > 0) {
      return node.keywords.join(' · ')
    }
    return null
  }, [node.keywords])

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-4 bottom-4 right-4 w-[360px] z-40 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="relative bg-white border-b border-gray-100/80 p-6 flex flex-col justify-end">
        <button
          onClick={() => selectNode(null)}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
        </button>

        <div className="flex items-center gap-2 mb-2 mt-2">
          <span
            className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
            style={{
              backgroundColor: node.color?.replace('0.9', '0.15') || 'rgba(226,232,240,0.15)',
              color: '#374151',
              borderColor: node.color?.replace('0.9', '0.3') || 'rgba(226,232,240,0.3)'
            }}
          >
            {node.category || '未分类'}
          </span>
        </div>

        {isRenaming ? (
          <div className="flex items-center gap-2">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameConfirm}
              className="flex-1 text-lg font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-gray-400"
            />
            <button
              onClick={handleRenameConfirm}
              className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <h2 className="text-xl font-bold text-gray-900 leading-tight line-clamp-2">
            {node.title}
          </h2>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Meta Info */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
            <Calendar className="w-3 h-3" />
            <span>{node.date}</span>
          </div>
          {node.keywords.map(k => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
              <Tag className="w-3 h-3" />
              <span>{k}</span>
            </div>
          ))}
        </div>

        {/* 节点摘要 */}
        {summary && (
          <div className="text-sm text-gray-600 leading-relaxed">
            {summary}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={handleContinue}
            className="col-span-2 flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-black transition-all shadow-lg"
          >
            <MessageSquare className="w-4 h-4" />
            继续这个话题
          </button>

          <button
            onClick={handleRenameStart}
            className="flex items-center justify-center gap-2 py-2.5 bg-gray-50 text-gray-600 rounded-xl font-medium text-xs hover:bg-gray-100 border border-gray-100 transition-all"
          >
            <Edit className="w-3.5 h-3.5" />
            重命名
          </button>

          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-xs hover:bg-red-100 border border-red-100 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      </div>
    </motion.div>
  )
}
