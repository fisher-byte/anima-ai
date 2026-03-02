import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Search, History, Minus, Plus, LayoutGrid } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { NodeCard } from './NodeCard'
import { Edge } from './Edge'
import { ConversationSidebar } from './ConversationSidebar'
import { SearchPanel } from './SearchPanel'
import { SettingsModal } from './SettingsModal'

export function Canvas() {
  const { nodes, edges, offset, scale, setOffset, setScale, resetView } = useCanvasStore()
  
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

  // 滚轮缩放处理
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault() // 始终阻止默认滚动，支持两指缩放
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
    
    const delta = -e.deltaY
    const factor = Math.pow(1.002, delta) // 更细腻的缩放
    setScale(scale * factor)
  }, [scale, setScale])

  // 画布拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 允许通过左键平移，或者空格+左键
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('dot-grid')) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      setIsDragging(true)
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
      lastPos.current = { x: e.clientX, y: e.clientY }
      velocity.current = { x: 0, y: 0 }
    }
  }, [offset])

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

      {/* 画布：外层平移缩放，内层轻微伪 3D 循环旋转 */}
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
          transformOrigin: 'center center',
          perspective: '1200px'
        }}
      >
        {/* 内层不拦截指针事件，保证空白处拖拽画布有效；节点需 pointer-events-auto */}
        <motion.div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transformStyle: 'preserve-3d', transformOrigin: '50% 50%' }}
          animate={{ rotateY: [0, 4, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* 连线渲染 (SVG层) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ transformStyle: 'preserve-3d' }}>
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

          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}

          {/* empty state */}
          {nodes.length === 0 && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm select-none pointer-events-none"
            >
              画布空空如也，开始你的第一次对话吧
            </div>
          )}
        </motion.div>
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
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  )
}
