import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node } from '@shared/types'

interface NodeCardProps {
  node: Node
}

export function NodeCard({ node }: NodeCardProps) {
  const { nodes, openModalById, removeNode, updateNodePosition } = useCanvasStore()
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  
  // 计算深度感：基于节点的活跃程度（索引位置）
  const depth = useMemo(() => {
    const index = nodes.findIndex(n => n.id === node.id)
    if (index === -1) return 1
    // 越新的节点（在数组末尾）越靠前
    const ratio = index / Math.max(1, nodes.length - 1)
    return 0.75 + ratio * 0.25 // 0.75 ~ 1.0
  }, [nodes, node.id])

  const dragStartRef = useRef({ x: 0, y: 0 })
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  // 同步外部坐标变更
  useEffect(() => {
    if (!isDragging) {
      positionRef.current = { x: node.x, y: node.y }
    }
  }, [node.x, node.y, isDragging])

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y
    const distance = Math.hypot(dx, dy)

    if (!isDragging && distance > 10) {
      setIsDragging(true)
    }

    // 如果已经在拖拽，则更新位置
    const currentIsDragging = isDragging || distance > 10
    if (currentIsDragging) {
      const newX = e.clientX - dragStartRef.current.x
      const newY = e.clientY - dragStartRef.current.y
      positionRef.current = { x: newX, y: newY }
      
      const el = document.getElementById(`node-${node.id}`)
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }
    }
  }, [isDragging, node.id])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    
    if (isDragging) {
      setIsDragging(false)
      lastDragEndRef.current = Date.now()
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)
    }
  }, [isDragging, node.id, updateNodePosition, handleGlobalMouseMove])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y
    }
    
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

  return (
    <motion.div
      id={`node-${node.id}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: isDragging ? 1.05 : depth, // 活跃节点更大
        opacity: isDragging ? 1 : 0.6 + (depth - 0.75) * 1.6, // 活跃节点更亮 (0.6 ~ 1.0)
        rotate: isDragging ? 2 : 0, 
        transition: { type: "spring", stiffness: 400, damping: 25 }
      }}
      className={`absolute cursor-grab active:cursor-grabbing group z-10`}
      style={{
        left: `${node.x}px`,
        top: `${node.y}px`,
        filter: isDragging ? 'none' : `blur(${(1 - depth) * 2}px)` // 远处节点轻微模糊
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div 
        layout
        className={`rounded-2xl transition-all duration-500 p-5 w-52 border backdrop-blur-sm ${
          isDragging 
            ? 'shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-blue-200/50' 
            : 'shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-white/50 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-blue-100/30'
        }`}
        style={{ 
          backgroundColor: node.color ? node.color.replace('0.9', '0.4') : 'rgba(255,255,255,0.6)',
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
  )
}
