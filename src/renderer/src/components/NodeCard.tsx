import { useState, useCallback, useRef, useEffect, useMemo, memo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Import } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useLodScale } from '../hooks/useLodScale'
import type { Node } from '@shared/types'

interface NodeCardProps {
  node: Node
  depth: number
}

/** 纯分发器：根据 nodeType 选择子组件，自身不持有任何 hooks，避免条件 hooks 违规 */
export const NodeCard = memo(function NodeCard({ node, depth }: NodeCardProps) {
  if (node.nodeType === 'capability') return <CapabilityNodeCard node={node} />
  return <RegularNodeCard node={node} depth={depth} />
})

function RegularNodeCard({ node, depth }: NodeCardProps) {
  // 细粒度 selector，不订阅整个 store（否则任何 store 变化都会重渲染所有 NodeCard）
  const removeNode = useCanvasStore(state => state.removeNode)
  const updateNodePosition = useCanvasStore(state => state.updateNodePosition)
  const openModalById = useCanvasStore(state => state.openModalById)
  const isHighlighted = useCanvasStore(state => state.highlightedNodeIds.includes(node.id))

  // 只在 LOD 阈值(0.4/0.6)跨越时触发重渲染，zoom 中不重渲染
  const scale = useLodScale([0.4, 0.6])
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  const lodOpacity = useMemo(() => {
    if (scale < 0.4) return 0
    if (scale > 0.6) return 1
    return (scale - 0.4) / 0.2
  }, [scale])

  const isVisible = lodOpacity > 0

  // 同步外部坐标变更
  useEffect(() => {
    if (!isDraggingRef.current) {
      positionRef.current = { x: node.x, y: node.y }
    }
  }, [node.x, node.y])

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y
    const distance = Math.hypot(dx, dy)

    if (!isDraggingRef.current && distance > 10) {
      isDraggingRef.current = true
      setIsDragging(true)
    }

    if (isDraggingRef.current) {
      const currentScale = useCanvasStore.getState().scale
      const newX = positionRef.current.x + (e.clientX - mouseDownPosRef.current.x) / currentScale
      const newY = positionRef.current.y + (e.clientY - mouseDownPosRef.current.y) / currentScale
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      positionRef.current = { x: newX, y: newY }

      const el = document.getElementById(`node-${node.id}`)
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }
    }
  }, [node.id])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)

    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      lastDragEndRef.current = Date.now()
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)
    }
  }, [node.id, updateNodePosition, handleGlobalMouseMove])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove, handleGlobalMouseUp])

  const handleClick = useCallback(() => {
    if (isDragging || Date.now() - lastDragEndRef.current < 200) return
    openModalById(node.conversationId)
  }, [node.conversationId, openModalById, isDragging])

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await removeNode(node.id)
  }, [removeNode, node.id])

  // 漂浮动画用 CSS animation（compositor thread，不占主线程）
  // 每个节点用 id 派生出不同的 duration/delay，实现错相位效果
  const floatStyle = useMemo(() => {
    const seed0 = node.id.charCodeAt(0) % 20
    const seed1 = (node.id.charCodeAt(1) || 0) % 20
    const durY = 4 + seed0 * 0.15
    const delayY = seed1 * 0.15
    const durX = 5.5 + ((node.id.charCodeAt(2) || 0) % 20) * 0.12
    const delayX = ((node.id.charCodeAt(3) || 0) % 20) * 0.15 + durY * 0.5
    return { durY, delayY, durX, delayX }
  }, [node.id])

  return (
    <motion.div
      id={`node-${node.id}`}
      initial={{ scale: 0.7, opacity: 0, filter: 'blur(8px)' }}
      animate={{
        scale: isDragging ? 1.06 : (isHighlighted ? 1.08 : depth),
        opacity: isVisible ? (isDragging ? 1 : (0.6 + (depth - 0.75) * 1.6) * lodOpacity) : 0,
        rotate: isDragging ? 2 : 0,
        filter: isDragging ? 'blur(0px)' : `blur(${(1 - depth) * 1.5}px)`,
      }}
      transition={{
        scale: { type: "spring", stiffness: 400, damping: 25 },
        opacity: { duration: 0.4 },
        rotate: { type: "spring", stiffness: 400, damping: 25 },
        filter: { duration: 0.4 },
      }}
      className="absolute cursor-grab active:cursor-grabbing group z-10 pointer-events-auto"
      style={{
        left: `${node.x}px`,
        top: `${node.y}px`,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 漂浮层：纯 CSS animation（compositor thread），拖拽时或缩小时停止 */}
      <div
        style={isDragging || scale < 0.6 ? undefined : {
          animation: `nodeFloatY ${floatStyle.durY}s ${floatStyle.delayY}s ease-in-out infinite alternate,
                      nodeFloatX ${floatStyle.durX}s ${floatStyle.delayX}s ease-in-out infinite alternate`,
        }}
      >
      {/* 高亮时的外发光圈（纯 CSS animation，compositor thread） */}
      {isHighlighted && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none node-highlight-glow"
          style={{ boxShadow: '0 0 0 2px rgba(0,0,0,0.15), 0 0 24px 6px rgba(0,0,0,0.1)', zIndex: -1 }}
        />
      )}
      <motion.div
        layout
        className={`rounded-2xl transition-all duration-300 p-5 w-52 border ${
          isHighlighted
            ? 'shadow-[0_0_20px_rgba(0,0,0,0.12)] border-gray-400/50 bg-white'
            : isDragging
              ? 'shadow-[0_20px_50px_rgba(0,0,0,0.12)] border-gray-200/80'
              : 'shadow-[0_4px_20px_rgba(0,0,0,0.04)] border-white/60 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:border-gray-200/60'
        }`}
        style={{
          backgroundColor: isHighlighted ? 'rgba(255,255,255,1)' : (node.color ? node.color.replace('0.9', '0.45') : 'rgba(255,255,255,0.65)'),
        }}
      >
        {/* 删除按钮 (仅悬停时展示) */}
        <AnimatePresence>
          {isHovered && !isDragging && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleDelete}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center transition-colors"
              title="删除节点"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 分类小标 */}
        {node.category && (
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400/80 mb-2">
            {node.category}
          </div>
        )}

        {/* 标题 */}
        <h3 className="font-medium text-gray-800 mb-2.5 text-[15px] break-words leading-snug line-clamp-3">
          {node.title}
        </h3>

        {/* 关键词 */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {node.keywords.map((keyword, idx) => (
            <span
              key={idx}
              className="text-[10px] px-2 py-0.5 bg-white/50 text-gray-500 rounded-lg border border-gray-100/50"
            >
              {keyword}
            </span>
          ))}
        </div>

        {/* 日期 */}
        <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
          <span>{node.date}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400/20" />
        </div>
      </motion.div>
      </div>
    </motion.div>
  )
}

// ── 能力节点渲染 ──────────────────────────────────────────────────────────────

function CapabilityNodeCard({ node }: { node: Node }) {
  const openCapability = useCanvasStore(state => state.openCapability)
  const updateNodePosition = useCanvasStore(state => state.updateNodePosition)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  // 同步外部坐标（仅非拖拽状态下）
  useEffect(() => {
    if (!isDraggingRef.current) {
      positionRef.current = { x: node.x, y: node.y }
      const el = document.getElementById(`cap-node-${node.id}`)
      if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px` }
    }
  }, [node.x, node.y, node.id])

  // 组件卸载时清理 window 监听器
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMoveRef.current)
      window.removeEventListener('mouseup', handleGlobalMouseUpRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 用 ref 存最新的 handler，供 useEffect cleanup 使用
  const handleGlobalMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {})
  const handleGlobalMouseUpRef = useRef<() => void>(() => {})

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y

    if (!isDraggingRef.current && Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true
      // 重置起点到当前位置，避免首帧跳跃
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (isDraggingRef.current) {
      const ddx = e.clientX - mouseDownPosRef.current.x
      const ddy = e.clientY - mouseDownPosRef.current.y
      const currentScale = useCanvasStore.getState().scale
      const newX = positionRef.current.x + ddx / currentScale
      const newY = positionRef.current.y + ddy / currentScale
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      positionRef.current = { x: newX, y: newY }
      // 直接操作外层定位 div（不走 framer-motion，避免冲突）
      const el = document.getElementById(`cap-node-${node.id}`)
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px` }
    }
  }, [node.id])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUpRef.current)
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      lastDragEndRef.current = Date.now()
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)
    }
  }, [node.id, updateNodePosition, handleGlobalMouseMove])

  // 保持 ref 同步
  useEffect(() => { handleGlobalMouseMoveRef.current = handleGlobalMouseMove }, [handleGlobalMouseMove])
  useEffect(() => { handleGlobalMouseUpRef.current = handleGlobalMouseUp }, [handleGlobalMouseUp])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove, handleGlobalMouseUp])

  const handleClick = useCallback(() => {
    if (isDraggingRef.current || Date.now() - lastDragEndRef.current < 200) return
    openCapability(node.id)
  }, [node.id, openCapability])

  const capId = node.capabilityData?.capabilityId ?? 'import-memory'
  const ICONS: Record<string, ReactNode> = {
    'import-memory': <Import className="w-4 h-4 text-gray-500" />
  }

  return (
    // 外层 div 仅负责定位，直接 DOM 操作不会被 framer-motion 干扰
    <div
      id={`cap-node-${node.id}`}
      style={{ position: 'absolute', left: `${node.x}px`, top: `${node.y}px` }}
      className="select-none z-10 pointer-events-auto cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* 内层 motion.div 只管入场动画，不管位置 */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div className="flex flex-col items-center gap-1.5 px-4 py-3.5 bg-white border-2 border-dashed border-gray-300 rounded-2xl shadow-sm hover:shadow-md hover:border-gray-400 transition-all w-36 text-center">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            {ICONS[capId]}
          </div>
          <div className="text-[12px] font-semibold text-gray-700 leading-tight">{node.title}</div>
          <div className="text-[10px] text-gray-400">点击使用</div>
        </div>
      </motion.div>
    </div>
  )
}
