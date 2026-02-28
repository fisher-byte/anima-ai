import { useState, useRef, useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { NodeCard } from './NodeCard'
import { ConversationSidebar } from './ConversationSidebar'
import { SearchPanel } from './SearchPanel'

export function Canvas() {
  const { nodes } = useCanvasStore()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // 侧边栏和搜索面板状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // 画布拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在点击画布空白处时拖拽
    if (e.target === canvasRef.current) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <>
      {/* 工具栏 */}
      <div className="fixed top-4 right-4 z-30 flex gap-2">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="p-2 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-gray-600"
          title="搜索 (Ctrl+K)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-gray-600"
          title="对话历史"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {/* 节点数量指示 */}
      {nodes.length > 0 && (
        <div className="fixed top-4 left-4 z-30 px-3 py-1 bg-white/80 rounded-full text-xs text-gray-500 shadow-sm">
          {nodes.length} 个节点
        </div>
      )}

      {/* 画布 */}
      <div
        ref={canvasRef}
        className="absolute inset-0 dot-grid cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          width: '200%',
          height: '200%',
          left: '-50%',
          top: '-50%'
        }}
      >
        {/* 节点渲染 */}
        {nodes.map((node) => (
          <NodeCard 
            key={node.id} 
            node={node} 
            offset={offset}
          />
        ))}
        
        {/* 空状态提示 */}
        {nodes.length === 0 && (
          <div 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm select-none pointer-events-none"
          >
            画布空空如也，开始你的第一次对话吧
          </div>
        )}
      </div>

      {/* 侧边栏和搜索面板 */}
      <ConversationSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <SearchPanel 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
    </>
  )
}
