import { useState, useRef, useCallback, useEffect } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { NodeCard } from './NodeCard'
import { Edge } from './Edge'
import { ConversationSidebar } from './ConversationSidebar'
import { SearchPanel } from './SearchPanel'

export function Canvas() {
  const { nodes, edges, offset, scale, setOffset, setScale, resetView } = useCanvasStore()
  
  // #region agent log
  useEffect(() => {
    if (nodes.length > 0) {
      const viewW = window.innerWidth
      const viewH = window.innerHeight
      // 画布容器左上角在屏幕 (-viewW, -viewH)
      // 节点在画布 (node.x, node.y)
      // 偏移在 (offset.x, offset.y)
      // 屏幕位置 = (-viewW + offset.x) + node.x
      const checkNode = nodes[0]
      const screenX = (-viewW + offset.x) + checkNode.x
      const screenY = (-viewH + offset.y) + checkNode.y
      
      fetch('http://127.0.0.1:7468/ingest/682f804a-d0e9-403b-aa62-25ff831522a6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d755'},body:JSON.stringify({sessionId:'02d755',runId:'coordinate-verify',hypothesisId:'H1',location:'Canvas.tsx:useEffect',message:'checking visible position',data:{firstNodeId:checkNode.id,nodePos:{x:checkNode.x,y:checkNode.y},offset,screenPos:{x:screenX,y:screenY},viewW,viewH},timestamp:Date.now()})}).catch(()=>{});
    }
  }, [nodes, offset]);
  // #endregion

  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // 侧边栏和搜索面板状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // 滚轮缩放处理
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault() // 始终阻止默认滚动，支持两指缩放
    const delta = -e.deltaY
    const factor = Math.pow(1.002, delta) // 更细腻的缩放
    setScale(scale * factor)
  }, [scale, setScale])

  // 画布拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 允许通过左键平移，或者空格+左键
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('dot-grid')) {
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
  }, [isDragging, dragStart, setOffset])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 处理手势缩放 (Touch)
  const touchStartDistRef = useRef<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      touchStartDistRef.current = dist
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current != null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const factor = dist / touchStartDistRef.current
      setScale(scale * factor)
      touchStartDistRef.current = dist
    } else if (e.touches.length === 1 && !isSidebarOpen) {
      // 单指平移逻辑可在必要时添加
    }
  }, [scale, setScale, isSidebarOpen])

  const handleTouchEnd = useCallback(() => {
    touchStartDistRef.current = null
  }, [])

  return (
    <>
      {/* 工具栏 */}
      <div className="fixed top-4 right-4 z-30 flex gap-2">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm flex items-center px-1 border border-gray-100">
          <button 
            onClick={() => setScale(scale * 0.8)} 
            className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
            title="缩小"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span className="text-[10px] font-medium text-gray-400 min-w-[36px] text-center select-none">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => setScale(scale * 1.2)} 
            className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
            title="放大"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <button
          onClick={resetView}
          className="p-2 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-gray-600"
          title="重置视图"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
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
        <div className="fixed top-4 left-4 z-30 px-3 py-1 bg-white/80 rounded-full text-xs text-gray-500 shadow-sm border border-gray-100">
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
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width: '300%', 
          height: '300%',
          left: '-100%',
          top: '-100%',
          transformOrigin: 'center center'
        }}
      >
        {/* 连线渲染 (SVG层) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {edges.map((edge) => {
            const sourceNode = nodes.find(n => n.id === edge.source)
            const targetNode = nodes.find(n => n.id === edge.target)
            if (!sourceNode || !targetNode) return null
            return (
              <Edge 
                key={edge.id}
                sourceNode={sourceNode}
                targetNode={targetNode}
              />
            )
          })}
        </svg>

        {/* 节点渲染 */}
        {nodes.map((node) => (
          <NodeCard 
            key={node.id} 
            node={node} 
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
      
      {/* 缩放手势支持 (Touch) - 基础平移支持已在 handleMouseDown 涵盖，缩放需双指逻辑 */}


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
