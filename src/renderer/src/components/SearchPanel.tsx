import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Hash, Calendar, ArrowRight } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useT } from '../i18n'

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const { t } = useT()
  const nodes = useCanvasStore(state => state.nodes)
  const openModalById = useCanvasStore(state => state.openModalById)
  const focusNode = useCanvasStore(state => state.focusNode)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'nodes' | 'content'>('nodes')

  // 搜索节点
  const nodeResults = useMemo(() => {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()
    return nodes.filter(node =>
      node.title.toLowerCase().includes(lowerQuery) ||
      node.keywords.some(k => k.toLowerCase().includes(lowerQuery)) ||
      (node.category && node.category.toLowerCase().includes(lowerQuery))
    )
  }, [nodes, query])

  // 搜索对话内容（目前搜索标题和分类，后续可增强）
  const contentResults = nodeResults

  // 点击结果
  const handleResultClick = useCallback((nodeId: string, conversationId: string) => {
    // 跳转到对应节点并打开对话
    focusNode(nodeId)
    openModalById(conversationId)
    onClose()
  }, [openModalById, focusNode, onClose])

  if (!isOpen) return null

  const results = activeTab === 'nodes' ? nodeResults : contentResults

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* 搜索面板 - 居中显示 */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 w-full max-w-lg bg-white rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
        {/* 搜索输入 */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search.placeholder}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-gray-200"
              autoFocus
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          {/* Tab切换 */}
          <div className="flex gap-4 mt-3">
            <button
              onClick={() => setActiveTab('nodes')}
              className={`text-sm pb-1 border-b-2 transition-colors ${
                activeTab === 'nodes'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-400'
              }`}
            >
              {t.search.tabNodes(nodeResults.length)}
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={`text-sm pb-1 border-b-2 transition-colors ${
                activeTab === 'content'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-400'
              }`}
            >
              {t.search.tabContent(contentResults.length)}
            </button>
          </div>
        </div>

        {/* 搜索结果 */}
        <div className="max-h-80 overflow-y-auto p-2">
          {!query.trim() ? (
            <div className="text-center text-gray-400 py-8">
              {t.search.typeToSearch}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              {t.search.noResults}
            </div>
          ) : (
            results.map((node) => (
              <motion.div
                layout
                key={node.id}
                onClick={() => handleResultClick(node.id, node.conversationId)}
                className="p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors group flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-3 h-3 text-blue-400" />
                    <div className="font-medium text-gray-800 text-sm break-words line-clamp-2">
                      {node.title}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {node.keywords.map((kw, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-gray-100/50 rounded-md">
                        {kw}
                      </span>
                    ))}
                    <div className="w-1 h-1 rounded-full bg-gray-200" />
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {node.date}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all" />
              </motion.div>
            ))
          )}
        </div>

        {/* 快捷键提示 */}
        <div className="p-3 bg-gray-50 text-xs text-gray-400 text-center">
          {t.search.escHint}
        </div>
      </div>
    </>
  )
}
