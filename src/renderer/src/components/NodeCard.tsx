import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node } from '@shared/types'

interface NodeCardProps {
  node: Node
  scale: number
  depth: number
}

export const NodeCard = memo(function NodeCard({ node, scale, depth }: NodeCardProps) {
  const { removeNode, updateNodePosition, openModalById, highlightedNodeIds } = useCanvasStore()
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Highlight state
  const isHighlighted = useMemo(() => highlightedNodeIds.includes(node.id), [highlightedNodeIds, node.id])

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  // 计算透明度过渡 (LOD)
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
      // 鼠标屏幕坐标 delta 需要除以当前画布 scale，才能转成画布坐标 delta
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

  // 随机浮动相位（每个节点不同）
  const floatDuration = useMemo(() => 4 + (node.id.charCodeAt(0) % 20) * 0.15, [node.id])
  const floatDelay = useMemo(() => (node.id.charCodeAt(1) || 0) % 20 * 0.15, [node.id])
  // x 轴漂移：与 y 轴错相位，形成轨道漂浮感
  const floatDurationX = useMemo(() => 5.5 + (node.id.charCodeAt(2) || 0) % 20 * 0.12, [node.id])
  const floatDelayX = useMemo(() => ((node.id.charCodeAt(3) || 0) % 20 * 0.15) + floatDuration * 0.5, [node.id, floatDuration])

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
      {/* 微浮动层：x+y 错相位漂移，产生轨道流动感 */}
      <motion.div
        animate={isDragging ? { x: 0, y: 0 } : { x: [0, 3, 0, -3, 0], y: [0, -4, 0] }}
        transition={{
          x: { duration: floatDurationX, repeat: Infinity, ease: "easeInOut", delay: floatDelayX },
          y: { duration: floatDuration, repeat: Infinity, ease: "easeInOut", delay: floatDelay }
        }}
      >
      {/* 高亮时的外发光圈 */}
      {isHighlighted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.12, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
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
        <h3 className="font-medium text-gray-800 mb-2.5 truncate text-[15px]">
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
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-1.5 h-1.5 rounded-full bg-blue-400/20"
          />
        </div>
      </motion.div>
      </motion.div>
    </motion.div>
  )
})
