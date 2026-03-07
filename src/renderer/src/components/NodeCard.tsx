/**
 * NodeCard — 画布节点卡片
 *
 * 职责：渲染画布上的单个节点，支持拖拽移动、点击展开对话、hover 显示操作按钮。
 *
 * 架构：纯分发器（dispatcher）模式
 *   NodeCard(dispatcher) → CapabilityNodeCard | RegularNodeCard
 *   按 nodeType 分发，避免条件 hooks 违规（React Rules of Hooks）。
 *
 * 性能策略：
 *   - memo 包装，selector 细粒度订阅（不订阅整个 store）
 *   - useLodScale：缩放 < 0.4 时降级渲染（隐藏细节元素）
 *   - 拖拽通过 canvasStore.updateNodePosition 更新，不触发全量重渲染
 *
 * 节点类型：
 *   'capability' — 固定功能卡（导入记忆等），不可删除
 *   'regular'    — 对话生成的知识节点，支持全部交互
 */
import { useState, useCallback, useRef, useEffect, useMemo, memo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Import, BookOpen, Layers, Paperclip } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useLodScale } from '../hooks/useLodScale'
import { useConfirm } from './GlobalUI'
import type { Node } from '@shared/types'

/** 拖拽碰撞检测最小间距（节点宽约 160px，此值使节点可挨近但不叠在一起） */
const NODE_MIN_GAP = 155

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
  const updateNodePositionInMemory = useCanvasStore(state => state.updateNodePositionInMemory)
  const openModalById = useCanvasStore(state => state.openModalById)
  const isHighlighted = useCanvasStore(state => state.highlightedNodeIds.includes(node.id))
  const confirm = useConfirm()

  // 只在 LOD 阈值(0.4/0.6)跨越时触发重渲染，zoom 中不重渲染
  const scale = useLodScale([0.4, 0.6])
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  // 缓存其他节点位置：用 store.subscribe 保持同步，避免每次 mousemove 调用 getState()
  const otherNodesRef = useRef(useCanvasStore.getState().nodes.filter(n => n.id !== node.id))
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(
      state => { otherNodesRef.current = state.nodes.filter(n => n.id !== node.id) }
    )
    return unsub
  }, [node.id])

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
      let newX = positionRef.current.x + (e.clientX - mouseDownPosRef.current.x) / currentScale
      let newY = positionRef.current.y + (e.clientY - mouseDownPosRef.current.y) / currentScale
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }

      // 碰撞检测：与其他节点保持最小间距，被拖节点遇到阻力时停在边界
      for (const other of otherNodesRef.current) {
        const dist = Math.hypot(newX - other.x, newY - other.y)
        if (dist < NODE_MIN_GAP && dist > 0) {
          // 沿两节点连线方向推开，保持在碰撞边界
          const factor = NODE_MIN_GAP / dist
          newX = other.x + (newX - other.x) * factor
          newY = other.y + (newY - other.y) * factor
        }
      }

      positionRef.current = { x: newX, y: newY }

      const el = document.getElementById(`node-${node.id}`)
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }

      // rAF 节流：每帧最多更新一次 store（让 Edge 跟随）
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          updateNodePositionInMemory(node.id, positionRef.current.x, positionRef.current.y)
          rafRef.current = null
        })
      }
    }
  }, [node.id, updateNodePositionInMemory])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)

    // Cancel any pending rAF from drag
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

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
    const ok = await confirm({
      title: '删除这条对话？',
      message: '删除后不可恢复。',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    await removeNode(node.id)
  }, [confirm, removeNode, node.id])

  // 漂浮+微旋转动画参数（id 派生，每节点错相位）
  const floatStyle = useMemo(() => {
    const seed0 = node.id.charCodeAt(0) % 20
    const seed1 = (node.id.charCodeAt(1) || 0) % 20
    const dur = 5 + seed0 * 0.2   // 5~9s，各节点不同
    const delay = seed1 * 0.2     // 0~3.8s 错相位
    return { dur, delay }
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
        y: isDragging ? -4 : (isHovered && !isDragging ? -2 : 0),
      }}
      transition={{
        scale: { type: "spring", stiffness: 400, damping: 25 },
        opacity: { duration: 0.4 },
        rotate: { type: "spring", stiffness: 400, damping: 25 },
        filter: { duration: 0.4 },
        y: { type: "spring", stiffness: 500, damping: 30 },
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
      {/* 漂浮+微旋转层：单一 nodeFloat keyframe（compositor thread），拖拽时或缩小时停止 */}
      <div
        style={isDragging || scale < 0.6 ? undefined : {
          animation: `nodeFloat ${floatStyle.dur}s ${floatStyle.delay}s ease-in-out infinite`,
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
        className={`rounded-2xl transition-all duration-300 w-52 border overflow-hidden ${
          isHighlighted
            ? 'shadow-[0_4px_24px_rgba(0,0,0,0.10)] border-gray-300/60'
            : isDragging
              ? 'shadow-[0_24px_48px_rgba(0,0,0,0.16)] border-gray-200/60'
              : isHovered
                ? 'shadow-[0_8px_32px_rgba(0,0,0,0.12)] border-gray-200/50'
                : 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-gray-100/80'
        }`}
        style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
      >
        {/* 左侧分类 accent 色条（3px，仅颜色提示，不抢戏） */}
        {node.color && (
          <div
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
            style={{ backgroundColor: node.color.replace('0.9', '0.7') }}
          />
        )}

        {/* 内容区（左边距略增，为色条留空间） */}
        <div className="p-5 pl-6">

        {/* 删除按钮 (仅悬停时展示) */}
        <AnimatePresence>
          {isHovered && !isDragging && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleDelete}
              className="absolute -top-2.5 -right-2.5 w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 text-gray-300 hover:text-red-400 hover:border-red-100 flex items-center justify-center transition-colors"
              title="删除节点"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 分类小标 */}
        {node.category && (
          <div className="text-[10px] text-gray-400/70 mb-1.5 tracking-wide">
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

        {/* 记忆引用数量 */}
        {(node.memoryCount ?? 0) > 0 && (
          <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
            <Layers className="w-3 h-3" />
            <span>引用了 {node.memoryCount} 条记忆</span>
          </div>
        )}

        {/* 文件附件（非图片） */}
        {node.files && node.files.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {node.files.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-1 px-2 py-0.5 bg-white/60 border border-gray-200/60 rounded-lg text-[10px] text-gray-500 max-w-[120px]"
                title={file.name}
              >
                <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
            ))}
          </div>
        )}
        </div>{/* end 内容区 pl-6 */}
      </motion.div>
      </div>
    </motion.div>
  )
}

// ── 能力节点渲染 ──────────────────────────────────────────────────────────────

function CapabilityNodeCard({ node }: { node: Node }) {
  const openCapability = useCanvasStore(state => state.openCapability)
  const openOnboarding = useCanvasStore(state => state.openOnboarding)
  const updateNodePosition = useCanvasStore(state => state.updateNodePosition)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)
  // Guard: briefly block useEffect DOM sync after drag ends, until store update arrives
  const justDraggedRef = useRef(false)

  // 同步外部坐标（仅非拖拽状态下，且不在刚结束拖拽的瞬间）
  useEffect(() => {
    if (isDraggingRef.current || justDraggedRef.current) return
    positionRef.current = { x: node.x, y: node.y }
    const el = document.getElementById(`cap-node-${node.id}`)
    if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px` }
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
      // Block useEffect DOM sync until store has written the new position
      justDraggedRef.current = true
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)
      // Clear guard after 200ms (store update + React re-render will have settled)
      setTimeout(() => { justDraggedRef.current = false }, 200)
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

  const capId = node.capabilityData?.capabilityId ?? 'import-memory'
  const ICONS: Record<string, ReactNode> = {
    'import-memory': <Import className="w-4 h-4 text-gray-500" />,
    'onboarding': <BookOpen className="w-4 h-4 text-gray-400" />
  }

  const handleClick = useCallback(() => {
    if (isDraggingRef.current || Date.now() - lastDragEndRef.current < 200) return
    if (capId === 'onboarding') {
      openOnboarding()
    } else {
      openCapability(node.id)
    }
  }, [node.id, capId, openCapability, openOnboarding])

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
