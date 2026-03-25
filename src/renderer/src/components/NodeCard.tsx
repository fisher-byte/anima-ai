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
 *   - 定位层（left/top）与动画层（scale/opacity）严格分离
 *   - 外层普通 div 持有 id + left/top，force sim 和拖拽直接写 DOM，Framer Motion 不碰定位
 *   - 内层 motion.div 只管入场/交互动画（scale/opacity/rotate/y），不设 left/top
 *   - 推挤逻辑只写 DOM，不写 store（避免重渲染覆盖 DOM 位置）
 *   - useLodScale：缩放 < 0.4 时降级渲染（隐藏细节元素）
 */
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, memo, useContext, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Import, BookOpen, Layers, Paperclip, MessageSquare, ListTodo, Plus, ArrowUpRight } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useLodScale } from '../hooks/useLodScale'
import { useConfirm } from './GlobalUI'
import { ForceSimContext, EntryActionsContext } from './Canvas'
import { useT } from '../i18n'
import type { Node } from '@shared/types'
import { getMemoryCardVariant, MEMORY_VARIANT_STYLES } from '../utils/nodeCardVariants'

/** 拖拽推挤半径：在此范围内的节点会被推开 */
const PUSH_RADIUS = 280
/** 推挤强度系数 */
const PUSH_STRENGTH = 0.3

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
  const isE2E = typeof window !== 'undefined' && (window as any).__E2E__ === true
  const removeNode = useCanvasStore(state => state.removeNode)
  const updateNodePosition = useCanvasStore(state => state.updateNodePosition)
  const openModalById = useCanvasStore(state => state.openModalById)
  const openNodeTimeline = useCanvasStore(state => state.openNodeTimeline)
  const isHighlighted = useCanvasStore(state => state.highlightedNodeIds.includes(node.id))
  const confirm = useConfirm()
  const forceSim = useContext(ForceSimContext)
  const { t } = useT()

  const scale = useLodScale([0.4, 0.6])
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)
  const justDraggedRef = useRef(false)

  // 缓存其他节点位置（仅用于推挤计算，读 DOM 当前坐标更准确）
  const otherNodeIdsRef = useRef<string[]>([])
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(
      state => { otherNodeIdsRef.current = state.nodes.filter(n => n.id !== node.id).map(n => n.id) }
    )
    otherNodeIdsRef.current = useCanvasStore.getState().nodes.filter(n => n.id !== node.id).map(n => n.id)
    return unsub
  }, [node.id])

  const lodOpacity = useMemo(() => {
    if (scale < 0.4) return 0
    if (scale > 0.6) return 1
    return (scale - 0.4) / 0.2
  }, [scale])

  const isVisible = lodOpacity > 0

  // 初始挂载时设置 DOM 位置（仅一次），后续由 force sim / 拖拽直接写 DOM
  // 使用 useLayoutEffect 确保在浏览器绘制前设置，避免初始位置闪烁
  useLayoutEffect(() => {
    const el = document.getElementById(`node-${node.id}`)
    if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px` }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 同步外部坐标变更：仅更新 positionRef（拖拽起点），不写 DOM
  // DOM 由 force sim 持续维护；节点初始位置由上方 useLayoutEffect 设置
  useEffect(() => {
    if (isDraggingRef.current || justDraggedRef.current) return
    positionRef.current = { x: node.x, y: node.y }
  }, [node.x, node.y])

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y

    if (!isDraggingRef.current && Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true
      setIsDragging(true)
      // 通知 force sim 暂停操控此节点（否则 sim tick 会覆盖拖拽位置）
      forceSim?.setDragging(node.id)
      // 从 DOM 读取节点当前实际位置，同步 positionRef（force sim 可能已移动节点）
      const el = document.getElementById(`node-${node.id}`)
      if (el) {
        const curX = parseFloat(el.style.left)
        const curY = parseFloat(el.style.top)
        if (!isNaN(curX) && !isNaN(curY)) {
          positionRef.current = { x: curX, y: curY }
        }
      }
      // 重置起点，避免首帧跳跃
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

      // 更新拖拽节点 DOM
      const el = document.getElementById(`node-${node.id}`)
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px` }

      // 推挤：读取邻近节点当前 DOM 位置（比 store 更实时）
      for (const otherId of otherNodeIdsRef.current) {
        const otherEl = document.getElementById(`node-${otherId}`)
        if (!otherEl) continue
        const ox = parseFloat(otherEl.style.left) || 0
        const oy = parseFloat(otherEl.style.top) || 0
        const distDx = ox - newX
        const distDy = oy - newY
        const dist = Math.hypot(distDx, distDy)
        if (dist > 0 && dist < PUSH_RADIUS) {
          const pushAmount = (PUSH_RADIUS - dist) * PUSH_STRENGTH
          const nx = distDx / dist
          const ny = distDy / dist
          otherEl.style.left = `${ox + nx * pushAmount}px`
          otherEl.style.top  = `${oy + ny * pushAmount}px`
        }
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
      justDraggedRef.current = true

      // ① 先把拖拽最终坐标同步到 sim 内部（防止 sim tick 推回旧位置）
      forceSim?.updateSimNode(node.id, positionRef.current.x, positionRef.current.y)

      // ② 同步被推挤节点的 DOM 坐标到 sim 内部
      for (const otherId of otherNodeIdsRef.current) {
        const otherEl = document.getElementById(`node-${otherId}`)
        if (!otherEl) continue
        const ox = parseFloat(otherEl.style.left) || 0
        const oy = parseFloat(otherEl.style.top) || 0
        if (Math.hypot(ox - positionRef.current.x, oy - positionRef.current.y) < PUSH_RADIUS * 1.5) {
          forceSim?.updateSimNode(otherId, ox, oy)
          updateNodePosition(otherId, ox, oy)
        }
      }

      // ③ 释放 force sim 并 kick
      forceSim?.setDragging(null)
      forceSim?.kick()

      // ④ 持久化拖拽节点到 store + SQLite
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)

      setTimeout(() => { justDraggedRef.current = false }, 300)
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
    const ids = node.conversationIds ?? [node.conversationId]
    if (ids.length > 1) {
      openNodeTimeline(node.id)
    } else {
      openModalById(node.conversationId)
    }
  }, [node, openModalById, openNodeTimeline, isDragging])

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = await confirm({
      title: t.space.deleteNodeTitle,
      message: t.space.deleteNodeWarning,
      confirmLabel: t.space.deleteConfirm,
      danger: true,
    })
    if (!ok) return
    await removeNode(node.id)
  }, [confirm, removeNode, node.id])

  const floatStyle = useMemo(() => {
    const seed0 = node.id.charCodeAt(0) % 20
    const seed1 = (node.id.charCodeAt(1) || 0) % 20
    return { dur: 5 + seed0 * 0.2, delay: seed1 * 0.2 }
  }, [node.id])

  const memVariant = useMemo(() => getMemoryCardVariant(node), [node])
  const variantStyle = MEMORY_VARIANT_STYLES[memVariant]

  return (
    // 外层 div：持有 id + 定位，force sim / 拖拽直接写 style.left/top
    // left/top 不在 React style prop 里——避免重渲染时 React 覆盖 DOM 坐标
    <div
      id={`node-${node.id}`}
      className="absolute cursor-grab active:cursor-grabbing group z-10 pointer-events-auto select-none"
      style={{ pointerEvents: isVisible ? 'auto' : 'none' }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 内层 motion.div：只管动画（scale/opacity/rotate/y），不碰 left/top */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0, filter: 'blur(8px)' }}
        animate={{
          scale: isDragging ? 1.06 : (isHighlighted ? 1.08 : depth),
          opacity: isVisible ? (isDragging ? 1 : (0.6 + (depth - 0.75) * 1.6) * lodOpacity) : 0,
          rotate: isDragging ? 2 : 0,
          filter: isDragging ? 'blur(0px)' : `blur(${(1 - depth) * 1.5}px)`,
          y: isDragging ? -4 : (isHovered && !isDragging ? -2 : 0),
        }}
        transition={{
          scale: { type: 'spring', stiffness: 400, damping: 25 },
          opacity: { duration: 0.4 },
          rotate: { type: 'spring', stiffness: 400, damping: 25 },
          filter: { duration: 0.4 },
          y: { type: 'spring', stiffness: 500, damping: 30 },
        }}
      >
        {/* 漂浮层：compositor thread keyframe，拖拽时停止 */}
        <div
          style={isDragging || scale < 0.6 || isE2E ? undefined : {
            animation: `nodeFloat ${floatStyle.dur}s ${floatStyle.delay}s ease-in-out infinite`,
          }}
        >
          {isHighlighted && (
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none node-highlight-glow"
              style={{ boxShadow: '0 0 0 2px rgba(0,0,0,0.15), 0 0 24px 6px rgba(0,0,0,0.1)', zIndex: -1 }}
            />
          )}
          <motion.div
            layout
            className={`rounded-2xl transition-all duration-300 w-52 border overflow-hidden ${
              memVariant !== 'neutral'
                ? variantStyle.shell
                : isHighlighted
                  ? 'shadow-[0_4px_24px_rgba(0,0,0,0.10)] border-gray-300/60'
                  : isDragging
                    ? 'shadow-[0_24px_48px_rgba(0,0,0,0.16)] border-gray-200/60'
                    : isHovered
                      ? 'shadow-[0_8px_32px_rgba(0,0,0,0.12)] border-gray-200/50'
                      : 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-gray-100/80'
            } ${
              memVariant !== 'neutral'
                ? isHighlighted
                  ? 'shadow-[0_4px_24px_rgba(0,0,0,0.12)]'
                  : isDragging
                    ? 'shadow-[0_24px_48px_rgba(0,0,0,0.18)]'
                    : isHovered
                      ? 'shadow-[0_8px_32px_rgba(0,0,0,0.14)]'
                      : 'shadow-[0_2px_16px_rgba(0,0,0,0.07)]'
                : ''
            }`}
            style={memVariant === 'neutral' ? { backgroundColor: 'rgba(255,255,255,0.92)' } : undefined}
          >
            {memVariant !== 'neutral' ? (
              <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${variantStyle.accentBar}`} />
            ) : node.color ? (
              <div
                className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
                style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}
              />
            ) : null}

            <div className="p-5 pl-6">
              <AnimatePresence>
                {isHovered && !isDragging && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={handleDelete}
                    className="absolute -top-2.5 -right-2.5 w-8 h-8 rounded-full bg-white shadow-sm border border-gray-100 text-gray-300 hover:text-red-400 hover:border-red-100 flex items-center justify-center transition-colors"
                    title={t.space.deleteNodeTooltip}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>

              {memVariant !== 'neutral' && variantStyle.chip && (
                <div className={`mb-1 ${variantStyle.chip}`}>
                  {memVariant === 'person' ? t.canvas.nodeVariantPerson : t.canvas.nodeVariantTask}
                </div>
              )}
              {node.category && (
                <div className="text-[10px] text-gray-400/70 mb-1.5 tracking-wide">
                  {node.category}
                </div>
              )}

              <h3 className="font-medium text-gray-800 mb-2.5 text-[15px] break-words leading-snug line-clamp-3">
                {node.title}
              </h3>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {(node.keywords ?? []).map((keyword, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 bg-white/50 text-gray-500 rounded-lg border border-gray-100/50"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                <span>{node.date}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300/40" />
              </div>

              {(node.memoryCount ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                  <Layers className="w-3 h-3" />
                  <span>{t.clusterLabel.memories(node.memoryCount ?? 0)}</span>
                </div>
              )}

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

              {(node.conversationIds?.length ?? 1) > 1 && (
                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                  <MessageSquare className="w-3 h-3" />
                  <span data-testid="conversation-count">{t.space.conversationCount(node.conversationIds!.length)}</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

// ── 能力节点渲染 ──────────────────────────────────────────────────────────────

function CapabilityNodeCard({ node }: { node: Node }) {
  const isE2E = typeof window !== 'undefined' && (window as any).__E2E__ === true
  const { t } = useT()
  const openCapability = useCanvasStore(state => state.openCapability)
  const openOnboarding = useCanvasStore(state => state.openOnboarding)
  const deleteCustomSpace = useCanvasStore(state => state.deleteCustomSpace)
  const confirm = useConfirm()
  const updateNodePosition = useCanvasStore(state => state.updateNodePosition)
  const entryActions = useContext(EntryActionsContext)
  const forceSim = useContext(ForceSimContext)

  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)
  const justDraggedRef = useRef(false)

  const capId = node.capabilityData?.capabilityId ?? 'import-memory'
  const isEntryNode = typeof node.id === 'string' && node.id.startsWith('entry:')
  const isCustomSpaceEntry = typeof capId === 'string' && capId.startsWith('custom-space:')
  const elemId = isEntryNode ? `node-${node.id}` : `cap-node-${node.id}`

  const floatStyle = useMemo(() => {
    const seed0 = node.id.charCodeAt(0) % 20
    const seed1 = (node.id.charCodeAt(1) || 0) % 20
    return { dur: 6 + seed0 * 0.2, delay: seed1 * 0.2 }
  }, [node.id])

  useEffect(() => {
    if (isDraggingRef.current || justDraggedRef.current) return
    positionRef.current = { x: node.x, y: node.y }
    const el = document.getElementById(elemId)
    if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px` }
  }, [node.x, node.y, elemId])

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMoveRef.current)
      window.removeEventListener('mouseup', handleGlobalMouseUpRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGlobalMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {})
  const handleGlobalMouseUpRef = useRef<() => void>(() => {})

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y

    if (!isDraggingRef.current && Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true
      if (isEntryNode) forceSim?.setDragging(node.id)
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
      const el = document.getElementById(elemId)
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px` }
    }
  }, [elemId, forceSim, isEntryNode, node.id])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      lastDragEndRef.current = Date.now()
      justDraggedRef.current = true
      if (isEntryNode) {
        forceSim?.updateSimNode(node.id, positionRef.current.x, positionRef.current.y)
        forceSim?.setDragging(null)
        forceSim?.kick()
      }
      updateNodePosition(node.id, positionRef.current.x, positionRef.current.y)
      setTimeout(() => { justDraggedRef.current = false }, 200)
    }
  }, [forceSim, handleGlobalMouseMove, isEntryNode, node.id, updateNodePosition])

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

    if (capId === 'onboarding') return openOnboarding()
    if (capId === 'import-memory') return openCapability(node.id)
    if (capId === 'decision-hub') return entryActions?.openDecisionHub()
    if (capId === 'create-space') return entryActions?.openCreateSpace()

    if (typeof capId === 'string' && capId.startsWith('space:')) {
      const persona = capId.slice('space:'.length) as any
      return entryActions?.openPublicSpace(persona)
    }
    if (typeof capId === 'string' && capId.startsWith('custom-space:')) {
      const spaceId = capId.slice('custom-space:'.length)
      return entryActions?.openCustomSpace(spaceId)
    }

    // fallback
    openCapability(node.id)
  }, [
    capId,
    node.id,
    entryActions,
    openCapability,
    openOnboarding,
  ])

  const handleDeleteCustomSpace = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isCustomSpaceEntry) return
    const spaceId = capId.slice('custom-space:'.length)
    const ok = await confirm({
      title: t.space.deleteSpaceTitle,
      message: t.space.deleteSpaceWarning,
      confirmLabel: t.space.deleteSpaceConfirm,
      danger: true,
    })
    if (!ok) return
    await deleteCustomSpace(spaceId)
  }, [capId, confirm, deleteCustomSpace, isCustomSpaceEntry, t.space.deleteSpaceConfirm, t.space.deleteSpaceTitle, t.space.deleteSpaceWarning])

  const ICON: ReactNode =
    capId === 'import-memory' ? <Import className="w-4 h-4 text-stone-500" /> :
    capId === 'onboarding' ? <BookOpen className="w-4 h-4 text-stone-400" /> :
    capId === 'decision-hub' ? <ListTodo className="w-4 h-4 text-stone-500" /> :
    capId === 'create-space' ? <Plus className="w-4 h-4 text-stone-500" /> :
    (typeof capId === 'string' && capId.startsWith('space:')) ? <ArrowUpRight className="w-4 h-4 text-stone-500" /> :
    <ArrowUpRight className="w-4 h-4 text-stone-500" />

  // 入口强调：把“左侧大块”改为“顶部 2px 细线 / 小色点”（更像普通节点，仅轻微提示）
  const ENTRY_TOP_ACCENT_CLASS =
    capId === 'decision-hub'
      ? 'bg-gradient-to-r from-stone-500/45 via-stone-400/20 to-transparent'
      : capId === 'create-space'
        ? 'bg-gradient-to-r from-stone-400/35 via-stone-300/15 to-transparent'
        : (typeof capId === 'string' && capId.startsWith('space:'))
          ? 'bg-gradient-to-r from-stone-500/35 via-stone-300/15 to-transparent'
          : isCustomSpaceEntry
            ? 'bg-gradient-to-r from-stone-400/35 via-stone-300/15 to-transparent'
            : 'bg-gradient-to-r from-stone-400/30 via-stone-300/12 to-transparent'

  const ENTRY_DOT_CLASS =
    capId === 'decision-hub'
      ? 'bg-stone-500/40'
      : capId === 'create-space'
        ? 'bg-stone-400/35'
        : (typeof capId === 'string' && capId.startsWith('space:'))
          ? 'bg-stone-500/30'
          : 'bg-stone-400/30'

  return (
    <div
      id={elemId}
      style={{ position: 'absolute', left: `${node.x}px`, top: `${node.y}px` }}
      className="select-none z-10 pointer-events-auto cursor-grab active:cursor-grabbing group"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={node.title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          // 复用点击逻辑（键盘不触发拖拽）
          handleClick()
        }
      }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, filter: 'blur(8px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div
          style={isDraggingRef.current || useCanvasStore.getState().scale < 0.6 || isE2E ? undefined : {
            animation: `nodeFloat ${floatStyle.dur}s ${floatStyle.delay}s ease-in-out infinite`,
          }}
        >
          <div
            className={`relative rounded-2xl transition-all duration-300 w-52 border overflow-hidden ${
              isEntryNode
                ? 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-gray-100/80 hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:border-gray-200/60'
                : 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-stone-200/70 hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] hover:border-stone-300/90'
            }`}
            style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
          >
            {/* Entry accent — 顶部细线 + 小点（更收敛，不抢主视觉） */}
            {isEntryNode && (
              <>
                <div className={`absolute left-0 right-0 top-0 h-[2px] ${ENTRY_TOP_ACCENT_CLASS}`} />
                <div className={`absolute right-4 top-4 w-1.5 h-1.5 rounded-full ${ENTRY_DOT_CLASS}`} />
              </>
            )}

            <div className="p-5 pl-6">
              {isEntryNode && node.category && (
                <div className="text-[10px] text-gray-400/70 mb-1.5 tracking-wide flex items-center gap-1.5">
                  <span>{node.category}</span>
                  <span className="ml-auto w-6 h-6 rounded-xl bg-gray-50 border border-gray-200/60 flex items-center justify-center">
                    {ICON}
                  </span>
                </div>
              )}

              <h3 className="font-medium text-gray-800 mb-2.5 text-[15px] break-words leading-snug line-clamp-3">
                {node.title}
              </h3>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {(node.keywords ?? []).slice(0, 3).map((keyword, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 bg-white/50 text-gray-500 rounded-lg border border-gray-100/50"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                <span>{node.date}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300/40" />
              </div>
            </div>

            {isCustomSpaceEntry && (
              <button
                type="button"
                onClick={handleDeleteCustomSpace}
                className="absolute -top-2.5 -right-2.5 w-8 h-8 rounded-full bg-white shadow-sm border border-stone-200 text-stone-300 hover:text-red-500 hover:border-red-200 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                title={t.space.deleteSpaceTitle}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
