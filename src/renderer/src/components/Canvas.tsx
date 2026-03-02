import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Search, History, Minus, Plus, LayoutGrid } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { NodeCard } from './NodeCard'
import { Edge } from './Edge'
import { ConversationSidebar } from './ConversationSidebar'
import { SearchPanel } from './SearchPanel'
import { SettingsModal } from './SettingsModal'

import { AmbientBackground } from './AmbientBackground'
import { ClusterLabel } from './ClusterLabel'

// Helper for cluster calculation
function getClusters(nodes: any[]) {
  const map = new Map<string, { x: number; y: number; count: number; color: string }>()
  nodes.forEach(n => {
    const cat = n.category || '其他'
    const curr = map.get(cat) || { x: 0, y: 0, count: 0, color: n.color || '#E2E8F0' }
    curr.x += n.x
    curr.y += n.y
    curr.count += 1
    map.set(cat, curr)
  })
  
  return Array.from(map.entries()).map(([cat, data]) => ({
    id: `cluster-${cat}`,
    category: cat,
    x: data.x / data.count,
    y: data.y / data.count,
    color: data.color,
    count: data.count
  }))
}

export function Canvas() {
  const { nodes, edges, offset, scale, setOffset, setScale, resetView, updateNodePosition, isModalOpen } = useCanvasStore()
  
  // Calculate clusters for Macro view
  const clusters = useMemo(() => getClusters(nodes), [nodes])

  // Cluster Interaction
  const handleClusterClick = useCallback((cx: number, cy: number) => {
      const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280
      const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
      // Calculate offset to center the cluster
      const newOffsetX = 1.5 * viewW - cx
      const newOffsetY = 1.5 * viewH - cy
      
      setOffset({ x: newOffsetX, y: newOffsetY })
      setScale(0.8) // Zoom in slightly
  }, [setOffset, setScale])
  
  const handleClusterDrag = useCallback((cat: string, dx: number, dy: number) => {
    // Move all nodes in this category
    nodes.forEach(n => {
        if ((n.category || '其他') === cat) {
            updateNodePosition(n.id, n.x + dx, n.y + dy)
        }
    })
  }, [nodes, updateNodePosition])

  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x: 0, y: 0 })
  const animationFrameId = useRef<number | null>(null)
  
  // 侧边栏、搜索和设置面板状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // 惯性动画
  const startInertia = useCallback(() => {
    const damping = 0.95
    const step = () => {
      velocity.current.x *= damping
      velocity.current.y *= damping

      if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
        setOffset({
          x: useCanvasStore.getState().offset.x + velocity.current.x,
          y: useCanvasStore.getState().offset.y + velocity.current.y
        })
        animationFrameId.current = requestAnimationFrame(step)
      } else {
        animationFrameId.current = null
      }
    }
    animationFrameId.current = requestAnimationFrame(step)
  }, [setOffset])

  // 滚轮缩放处理（以鼠标位置为中心缩放）—— 用原生事件以便 preventDefault() 真正生效
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)

      // deltaMode: 0=px, 1=line, 2=page
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const delta = -rawDelta
      // 区分触控板（小 delta）和鼠标滚轮（大 delta）用同一个公式
      const factor = Math.pow(1.001, delta)
      const { scale: currentScale, offset: currentOffset } = useCanvasStore.getState()
      const newScale = Math.max(0.2, Math.min(3, currentScale * factor))

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const scaleDiff = newScale / currentScale

      useCanvasStore.getState().setOffset({
        x: mouseX - scaleDiff * (mouseX - currentOffset.x),
        y: mouseY - scaleDiff * (mouseY - currentOffset.y),
      })
      useCanvasStore.getState().setScale(newScale)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])  // empty deps — reads latest state from store directly

  // 画布拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 允许通过左键平移，或者空格+左键
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('dot-grid')) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      const currentOffset = useCanvasStore.getState().offset  // 从 store 读最新值，避免 wheel 事件后闭包旧值
      setIsDragging(true)
      dragStart.current = { x: e.clientX - currentOffset.x, y: e.clientY - currentOffset.y }
      lastPos.current = { x: e.clientX, y: e.clientY }
      velocity.current = { x: 0, y: 0 }
    }
  }, [])  // 去掉 offset 依赖，始终从 store 读最新值

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      
      // 平滑速度计算 (加权平均)
      velocity.current = {
        x: velocity.current.x * 0.2 + dx * 0.8,
        y: velocity.current.y * 0.2 + dy * 0.8
      }
      
      lastPos.current = { x: e.clientX, y: e.clientY }
      
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      })
    }
  }, [isDragging, setOffset])

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      if (Math.abs(velocity.current.x) > 2 || Math.abs(velocity.current.y) > 2) {
        startInertia()
      }
    }
  }, [isDragging, startInertia])

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
      <div className="fixed top-6 right-6 z-30 flex items-center gap-3">
        {/* 视图控制挂件 */}
        <div className="flex items-center bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 overflow-hidden px-1 py-1">
          <button 
            onClick={() => setScale(scale * 0.8)} 
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
            title="缩小"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div 
            className="px-2 min-w-[50px] text-center cursor-pointer hover:bg-gray-50 rounded-lg py-1 transition-all"
            onClick={resetView}
            title="重置视图"
          >
            <span className="text-[11px] font-bold text-gray-500 uppercase">{Math.round(scale * 100)}%</span>
          </div>
          <button 
            onClick={() => setScale(scale * 1.2)} 
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
            title="放大"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* 应用菜单挂件 */}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`p-3 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 ${isMenuOpen ? 'text-blue-600 bg-blue-50/50 ring-2 ring-blue-100' : 'text-gray-500 hover:text-gray-900'}`}
            title="更多应用"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-3 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 p-2 z-40 origin-top-right"
              >
                <button
                  onClick={() => { setIsSearchOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Search className="w-4 h-4" />
                  <span className="font-medium">全局搜索</span>
                  <span className="ml-auto text-[10px] text-gray-300 font-bold border px-1 rounded">⌘K</span>
                </button>
                <button
                  onClick={() => { setIsSidebarOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <History className="w-4 h-4" />
                  <span className="font-medium">对话历史</span>
                </button>
                <div className="my-1 border-t border-gray-100/50" />
                <button
                  onClick={() => { setIsSettingsOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-medium">偏好设置</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 节点数量指示 */}
      {nodes.length > 0 && (
        <div className="fixed top-4 left-4 z-30 px-3 py-1 bg-white/80 rounded-full text-xs text-gray-500 shadow-sm border border-gray-100">
          {nodes.length} 个节点
        </div>
      )}

      <AmbientBackground />

      {/* 画布：外层做模糊/缩放效果，但本身不拦截事件 */}
      <motion.div
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
        animate={{
          scale: isModalOpen ? 0.97 : 1,
          filter: isModalOpen ? 'blur(3px)' : 'blur(0px)',
          opacity: isModalOpen ? 0.75 : 1
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* 可交互的画布底层（接收拖拽事件） */}
        <div
          ref={canvasRef}
          className="absolute inset-0 dot-grid cursor-grab active:cursor-grabbing"
          style={{ pointerEvents: isModalOpen ? 'none' : 'auto', overflow: 'hidden' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 内容层：平移+缩放变换 */}
          <div
            style={{
              position: 'absolute',
              width: '300vw',
              height: '300vh',
              left: '-100vw',
              top: '-100vh',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
            }}
          >
            {/* 连线渲染 (SVG层) */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {edges.map((edge) => {
                const sourceNode = nodes.find(n => n.id === edge.source)
                const targetNode = nodes.find(n => n.id === edge.target)
                if (!sourceNode || !targetNode) return null
                return (
                  <Edge
                    key={edge.id}
                    sourceNode={sourceNode}
                    targetNode={targetNode}
                    scale={scale}
                  />
                )
              })}
            </svg>

            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}

            {/* Macro View Clusters */}
            {clusters.map(c => (
              <ClusterLabel
                key={c.id}
                cluster={c}
                scale={scale}
                onDrag={(dx, dy) => handleClusterDrag(c.category, dx, dy)}
                onClick={() => handleClusterClick(c.x, c.y)}
              />
            ))}

            {/* empty state */}
            {nodes.length === 0 && (
              <div
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                className="text-gray-300 text-sm select-none pointer-events-none whitespace-nowrap"
              >
                画布空空如也，开始你的第一次对话吧
              </div>
            )}
          </div>
        </div>
      </motion.div>
      
      {/* 侧边栏和搜索面板 */}
      <ConversationSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <SearchPanel 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  )
}
