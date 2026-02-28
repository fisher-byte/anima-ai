import { useState, useMemo, useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SearchPanel({ isOpen, onClose }: SearchPanelProps) {
  const { nodes, openModal } = useCanvasStore()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'nodes' | 'content'>('nodes')

  // 搜索节点
  const nodeResults = useMemo(() => {
    if (!query.trim()) return []
    
    const lowerQuery = query.toLowerCase()
    return nodes.filter(node => 
      node.title.toLowerCase().includes(lowerQuery) ||
      node.keywords.some(k => k.toLowerCase().includes(lowerQuery))
    )
  }, [nodes, query])

  // 搜索对话内容（简化版，只搜索节点关联的对话）
  const contentResults = useMemo(() => {
    if (!query.trim() || activeTab !== 'content') return []
    
    const lowerQuery = query.toLowerCase()
    // 这里简化处理，实际应该搜索conversations.jsonl
    return nodes.filter(node => 
      node.title.toLowerCase().includes(lowerQuery)
    )
  }, [nodes, query, activeTab])

  // 点击结果
  const handleResultClick = useCallback((nodeId: string) => {
    // 这里应该跳转到对应节点并打开对话
    // 简化处理：打开对应节点的对话
    const conversation = {
      id: nodeId,
      createdAt: new Date().toISOString(),
      userMessage: '',
      assistantMessage: ''
    }
    openModal(conversation)
    onClose()
  }, [openModal, onClose])

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
              placeholder="搜索节点标题、关键词..."
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
              节点 ({nodeResults.length})
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={`text-sm pb-1 border-b-2 transition-colors ${
                activeTab === 'content' 
                  ? 'border-gray-800 text-gray-800' 
                  : 'border-transparent text-gray-400'
              }`}
            >
              内容 ({contentResults.length})
            </button>
          </div>
        </div>
        
        {/* 搜索结果 */}
        <div className="max-h-80 overflow-y-auto p-2">
          {!query.trim() ? (
            <div className="text-center text-gray-400 py-8">
              输入关键词开始搜索
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              未找到匹配结果
            </div>
          ) : (
            results.map((node) => (
              <div
                key={node.id}
                onClick={() => handleResultClick(node.conversationId)}
                className="p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
              >
                <div className="font-medium text-gray-800 text-sm mb-1">
                  {node.title}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {node.keywords.map((kw, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded-full">
                      {kw}
                    </span>
                  ))}
                  <span className="text-gray-400">{node.date}</span>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* 快捷键提示 */}
        <div className="p-3 bg-gray-50 text-xs text-gray-400 text-center">
          按 ESC 关闭
        </div>
      </div>
    </>
  )
}
