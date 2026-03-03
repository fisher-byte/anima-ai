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
import type { Node as CanvasNode } from '@shared/types'

/** 记忆引用连线：从高亮节点画虚线到输入框位置 */
function MemoryLines({
  nodes,
  highlightedNodeIds,
  offset,
  scale,
}: {
  nodes: CanvasNode[]
  highlightedNodeIds: string[]
  offset: { x: number; y: number }
  scale: number
}) {
  if (highlightedNodeIds.length === 0) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  // 输入框固定在底部中央
  const targetX = vw / 2
  const targetY = vh - 80

  // Canvas 内容层偏移：left=-100vw, top=-100vh，再加 translate(offset.x, offset.y) scale(scale)
  // 节点屏幕坐标 = node.canvasPos * scale + offset - [vw, vh]
  const NODE_W = 208  // NodeCard 固定宽度 w-52
  const NODE_H = 100  // 节点大致高度（估算）
  const lines = highlightedNodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is CanvasNode => !!n)
    .map(node => {
      // 节点左上角屏幕坐标
      const nx = node.x * scale + offset.x - vw
      const ny = node.y * scale + offset.y - vh
      // 节点中心屏幕坐标
      const sx = nx + (NODE_W / 2) * scale
      const sy = ny + (NODE_H / 2) * scale
      return { id: node.id, sx, sy }
    })
    // 只画节点中心严格在屏幕可视区内的连线，避免"悬空线"
    .filter(({ sx, sy }) => sx >= 0 && sx <= vw && sy >= 0 && sy <= vh - 100)

  if (lines.length === 0) return null

  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 25 }}
    >
      <defs>
        <marker id="mem-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <circle cx="3" cy="3" r="2" fill="rgba(0,0,0,0.2)" />
        </marker>
      </defs>
      {lines.map(({ id, sx, sy }, i) => (
        <motion.path
          key={id}
          d={`M ${sx} ${sy} L ${targetX} ${targetY}`}
          stroke="rgba(0,0,0,0.13)"
          strokeWidth={1.5}
          strokeDasharray="6 5"
          fill="none"
          markerEnd="url(#mem-arrow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
        />
      ))}
    </svg>
  )
}

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
  // 細粒度订阅：只订阅会引起 UI 变化的数据，函数用 getState() 避免触发重渲染
  const nodes = useCanvasStore(state => state.nodes)
  const edges = useCanvasStore(state => state.edges)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const highlightedNodeIds = useCanvasStore(state => state.highlightedNodeIds)
  // actions 从 getState() 取，不订阅 store，不触发重渲染
  const setOffset = useCallback((o: {x:number;y:number}) => useCanvasStore.getState().setOffset(o), [])
  const setScale = useCallback((s: number) => useCanvasStore.getState().setScale(s), [])
  const resetView = useCallback(() => useCanvasStore.getState().resetView(), [])
  const updateNodePosition = useCallback((id: string, x: number, y: number) => useCanvasStore.getState().updateNodePosition(id, x, y), [])

  // offset/scale 完全用 ref 管理，不走 React state，避免 zoom 触发任何重渲染
  const viewRef = useRef({ offset: useCanvasStore.getState().offset, scale: useCanvasStore.getState().scale })
  const contentLayerRef = useRef<HTMLDivElement>(null)
  // 仅用于工具栏百分比显示（低频更新）
  const [scaleDisplay, setScaleDisplay] = useState(useCanvasStore.getState().scale)

  // 直接操作 content layer 的 transform，完全绕过 React 渲染
  const applyTransform = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (contentLayerRef.current) {
      contentLayerRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
    }
    viewRef.current = { offset, scale }
  }, [])

  // Calculate clusters for Macro view
  const clusters = useMemo(() => getClusters(nodes), [nodes])

  // 预计算每个节点的 depth
  const nodeDepthMap = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach((n, index) => {
      const ratio = index / Math.max(1, nodes.length - 1)
      map.set(n.id, 0.75 + ratio * 0.25)
    })
    return map
  }, [nodes])

  // 预计算节点 id → node Map，edge 渲染 O(1)
  const nodeMap = useMemo(() => {
    const map = new Map<string, typeof nodes[0]>()
    nodes.forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  // Cluster Interaction
  const handleClusterClick = useCallback((cx: number, cy: number) => {
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const newOffset = { x: 1.5 * viewW - cx, y: 1.5 * viewH - cy }
    const newScale = 0.8
    applyTransform(newOffset, newScale)
    setScaleDisplay(newScale)
    setOffset(newOffset)
    setScale(newScale)
  }, [applyTransform, setOffset, setScale])

  const handleClusterDrag = useCallback((cat: string, dx: number, dy: number) => {
    nodes.forEach(n => {
      if ((n.category || '其他') === cat) updateNodePosition(n.id, n.x + dx, n.y + dy)
    })
  }, [nodes, updateNodePosition])

  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x: 0, y: 0 })
  const animationFrameId = useRef<number | null>(null)
  const pendingOffsetRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragRafId = useRef<number | null>(null)

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // 惯性动画 — 直接操作 DOM，不 setState
  const startInertia = useCallback(() => {
    const damping = 0.95
    const step = () => {
      velocity.current.x *= damping
      velocity.current.y *= damping
      if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
        const { offset } = viewRef.current
        const newOffset = { x: offset.x + velocity.current.x, y: offset.y + velocity.current.y }
        applyTransform(newOffset, viewRef.current.scale)
        animationFrameId.current = requestAnimationFrame(step)
      } else {
        animationFrameId.current = null
        // 惯性结束后同步到 store（持久化）
        setOffset(viewRef.current.offset)
      }
    }
    animationFrameId.current = requestAnimationFrame(step)
  }, [applyTransform, setOffset])

  // 滚轮缩放 — 直接操作 DOM，每帧最多一次，完全不触发 React 重渲染
  // wheel 事件按帧合并，避免事件洪泛
  const pendingWheelDeltaRef = useRef(0)
  const lastWheelClientRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  const scaleDisplayRafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null }

      lastWheelClientRef.current = { clientX: e.clientX, clientY: e.clientY }
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      pendingWheelDeltaRef.current += rawDelta

      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(() => {
          const canvasEl = canvasRef.current
          if (lastWheelClientRef.current && canvasEl) {
            const currentScale = viewRef.current.scale
            const factor = Math.pow(1.001, -pendingWheelDeltaRef.current)
            const newScaleRaf = Math.max(0.2, Math.min(3, currentScale * factor))
            const rect = canvasEl.getBoundingClientRect()
            const mouseX = lastWheelClientRef.current.clientX - rect.left
            const mouseY = lastWheelClientRef.current.clientY - rect.top
            const { offset, scale: prevScale } = viewRef.current
            const scaleDiff = newScaleRaf / prevScale
            const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
            const vh = typeof window !== 'undefined' ? window.innerHeight : 800
            const mouseInContentX = mouseX + vw
            const mouseInContentY = mouseY + vh
            const newOffset = {
              x: mouseInContentX - scaleDiff * (mouseInContentX - offset.x),
              y: mouseInContentY - scaleDiff * (mouseInContentY - offset.y),
            }
            applyTransform(newOffset, newScaleRaf)
          }
          pendingWheelDeltaRef.current = 0
          wheelRafRef.current = null
        })
      }

      // zoom 停止 120ms 后 store 同步一次 → useLodScale 触发 (LOD 切换) + 工具栏 % 更新
      if (scaleDisplayRafRef.current) clearTimeout(scaleDisplayRafRef.current)
      scaleDisplayRafRef.current = window.setTimeout(() => {
        const { offset, scale } = viewRef.current
        useCanvasStore.setState({ offset, scale: Math.max(0.2, Math.min(3, scale)) })
        setScaleDisplay(scale)
        scaleDisplayRafRef.current = null
      }, 120)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current)
      if (scaleDisplayRafRef.current) clearTimeout(scaleDisplayRafRef.current)
    }
  }, [applyTransform, setOffset, setScale])

  // 拖拽 — 直接操作 DOM
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('dot-grid')) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      const { offset } = viewRef.current
      pendingOffsetRef.current = { ...offset }
      isDraggingRef.current = true
      setIsDragging(true)
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
      lastPos.current = { x: e.clientX, y: e.clientY }
      velocity.current = { x: 0, y: 0 }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    velocity.current = { x: velocity.current.x * 0.2 + dx * 0.8, y: velocity.current.y * 0.2 + dy * 0.8 }
    lastPos.current = { x: e.clientX, y: e.clientY }
    pendingOffsetRef.current = { x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      if (Math.abs(velocity.current.x) > 2 || Math.abs(velocity.current.y) > 2) {
        startInertia()
      } else {
        setOffset(viewRef.current.offset)
      }
    }
  }, [startInertia, setOffset])

  // 拖拽 RAF loop — 直接操作 DOM，不 setState
  useEffect(() => {
    if (!isDragging) {
      if (dragRafId.current) cancelAnimationFrame(dragRafId.current)
      dragRafId.current = null
      return
    }
    const loop = () => {
      applyTransform(pendingOffsetRef.current, viewRef.current.scale)
      if (isDraggingRef.current) dragRafId.current = requestAnimationFrame(loop)
    }
    dragRafId.current = requestAnimationFrame(loop)
    return () => { if (dragRafId.current) cancelAnimationFrame(dragRafId.current) }
  }, [isDragging, applyTransform])

  // 处理手势缩放 (Touch)
  const touchStartDistRef = useRef<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchStartDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current != null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const factor = dist / touchStartDistRef.current
      const newScale = Math.max(0.2, Math.min(3, viewRef.current.scale * factor))
      applyTransform(viewRef.current.offset, newScale)
      touchStartDistRef.current = dist
    }
  }, [applyTransform])

  const handleTouchEnd = useCallback(() => {
    touchStartDistRef.current = null
    setOffset(viewRef.current.offset)
    setScale(viewRef.current.scale)
    setScaleDisplay(viewRef.current.scale)
  }, [setOffset, setScale])

  return (
    <>
      {/* 工具栏 */}
      <div className="fixed top-6 right-6 z-30 flex items-center gap-3">
        {/* 视图控制挂件 */}
        <div className="flex items-center bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 overflow-hidden px-1 py-1">
          <button
            onClick={() => {
              const newScale = Math.max(0.2, viewRef.current.scale * 0.8)
              applyTransform(viewRef.current.offset, newScale)
              setScaleDisplay(newScale)
              setScale(newScale)
            }}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
            title="缩小"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div
            className="px-2 min-w-[50px] text-center cursor-pointer hover:bg-gray-50 rounded-lg py-1 transition-all"
            onClick={() => {
              const initOffset = { x: 0, y: 0 }
              applyTransform(initOffset, 1)
              setScaleDisplay(1)
              resetView()
            }}
            title="重置视图"
          >
            <span className="text-[11px] font-bold text-gray-500 uppercase">{Math.round(scaleDisplay * 100)}%</span>
          </div>
          <button
            onClick={() => {
              const newScale = Math.min(3, viewRef.current.scale * 1.2)
              applyTransform(viewRef.current.offset, newScale)
              setScaleDisplay(newScale)
              setScale(newScale)
            }}
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

      {/* 画布：外层做模糊/缩放效果，纯 CSS transition，不用 Framer Motion 避免持续动画上下文 */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          pointerEvents: 'none',
          transform: isModalOpen ? 'scale(0.97)' : 'scale(1)',
          filter: isModalOpen ? 'blur(3px)' : 'none',
          opacity: isModalOpen ? 0.75 : 1,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), filter 0.3s ease, opacity 0.3s ease',
          willChange: 'auto',
        }}
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
          {/* 内容层：平移+缩放变换，transform 由 applyTransform 直接操作 DOM，不走 React state */}
          <div
            ref={contentLayerRef}
            style={{
              position: 'absolute',
              width: '300vw',
              height: '300vh',
              left: '-100vw',
              top: '-100vh',
              transform: `translate(${useCanvasStore.getState().offset.x}px, ${useCanvasStore.getState().offset.y}px) scale(${useCanvasStore.getState().scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          >
          {/* 连线渲染 (SVG层) */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {edges.map((edge) => {
                const sourceNode = nodeMap.get(edge.source)
                const targetNode = nodeMap.get(edge.target)
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
              <NodeCard key={node.id} node={node} depth={nodeDepthMap.get(node.id) ?? 1} />
            ))}

            {/* Macro View Clusters */}
            {clusters.map(c => (
              <ClusterLabel
                key={c.id}
                cluster={c}
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
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 记忆引用连线 overlay：高亮节点 → 输入框 */}
      <AnimatePresence>
        {highlightedNodeIds.length > 0 && (
          <MemoryLines
            nodes={nodes}
            highlightedNodeIds={highlightedNodeIds}
            offset={viewRef.current.offset}
            scale={viewRef.current.scale}
          />
        )}
      </AnimatePresence>
    </>
  )
}
