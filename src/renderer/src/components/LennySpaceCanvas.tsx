/**
 * LennySpaceCanvas — Lenny Rachitsky 沉浸式记忆画布
 *
 * 与用户个人空间完全对称的体验：
 * - 节点从 lenny-nodes.json 加载，首次进入用种子数据
 * - 画布交互（平移/缩放/拖拽）与 Canvas.tsx 一致
 * - 点击节点 → startConversation → AnswerModal（复用真实对话逻辑）
 * - 底部输入框：与普通空间 InputBox 体验一致，Enter 发送
 * - 对话结束后自动写 lenny-nodes.json / lenny-conversations.jsonl
 * - 不污染用户的 nodes.json / conversations.jsonl
 */
import {
  useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo,
} from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import { Edge } from './Edge'
import { storageService } from '../services/storageService'
import { LENNY_SEED_NODES, LENNY_SEED_EDGES } from '@shared/lennyData'
import { STORAGE_FILES } from '@shared/constants'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node, Edge as EdgeType } from '@shared/types'

// ─── LennyNodeCard ────────────────────────────────────────────────────────────

interface LennyNodeCardProps {
  node: Node
  onContextSelect: (title: string) => void
  onPositionChange: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  scale: number
}

function LennyNodeCard({ node, onContextSelect, onPositionChange, onDragEnd, scale }: LennyNodeCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  useLayoutEffect(() => {
    const el = document.getElementById(`lenny-node-${node.id}`)
    if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px` }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDraggingRef.current) return
    positionRef.current = { x: node.x, y: node.y }
  }, [node.x, node.y])

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y

    if (!isDraggingRef.current && Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true
      const el = document.getElementById(`lenny-node-${node.id}`)
      if (el) {
        const curX = parseFloat(el.style.left)
        const curY = parseFloat(el.style.top)
        if (!isNaN(curX) && !isNaN(curY)) positionRef.current = { x: curX, y: curY }
      }
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (isDraggingRef.current) {
      const ddx = e.clientX - mouseDownPosRef.current.x
      const ddy = e.clientY - mouseDownPosRef.current.y
      const newX = positionRef.current.x + ddx / scale
      const newY = positionRef.current.y + ddy / scale
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      positionRef.current = { x: newX, y: newY }
      const el = document.getElementById(`lenny-node-${node.id}`)
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px` }
      onPositionChange(node.id, newX, newY)
    }
  }, [node.id, scale, onPositionChange])

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      lastDragEndRef.current = Date.now()
      onDragEnd(node.id, positionRef.current.x, positionRef.current.y)
    }
  }, [node.id, handleGlobalMouseMove, onDragEnd])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove, handleGlobalMouseUp])

  const handleClick = useCallback(() => {
    if (Date.now() - lastDragEndRef.current < 200) return
    onContextSelect(node.title)
  }, [node.title, onContextSelect])

  const categoryColor: Record<string, string> = {
    '工作事业': '#3B82F6',
    '思考世界': '#8B5CF6',
    '关系情感': '#EC4899',
    '健康身体': '#10B981',
    '创意表达': '#F59E0B',
    '生活日常': '#94A3B8',
  }
  const accentColor = categoryColor[node.category ?? ''] ?? '#94A3B8'

  return (
    <div
      id={`lenny-node-${node.id}`}
      className="absolute cursor-grab active:cursor-grabbing select-none"
      style={{ zIndex: 10, pointerEvents: 'auto' }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0, filter: 'blur(8px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', y: isHovered ? -2 : 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className={`w-52 rounded-2xl border overflow-hidden transition-all duration-200 ${
          isHovered
            ? 'shadow-[0_8px_32px_rgba(0,0,0,0.12)] border-gray-200/50'
            : 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-gray-100/80'
        }`}
        style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
      >
        <div className="p-5 pl-6 relative">
          {node.category && (
            <div className="text-[10px] text-gray-400/70 mb-1.5 tracking-wide">
              {node.category}
            </div>
          )}
          <h3 className="font-medium text-gray-800 mb-2.5 text-[15px] leading-snug line-clamp-3">
            {node.title}
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {node.keywords.slice(0, 3).map((kw, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 bg-white/50 text-gray-500 rounded-lg border border-gray-100/50"
              >
                {kw}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <span>{node.date}</span>
            {isHovered && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-amber-500/70"
              >
                点击提问 →
              </motion.span>
            )}
          </div>
          <div
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
            style={{ backgroundColor: accentColor, opacity: 0.25 }}
          />
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LennySpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function LennySpaceCanvas({ isOpen, onClose }: LennySpaceCanvasProps) {
  // ── Canvas state ────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<EdgeType[]>([])
  const [nodesLoaded, setNodesLoaded] = useState(false)

  // ── Input box state ──────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Store ────────────────────────────────────────────────────────────────────
  const startConversation = useCanvasStore(state => state.startConversation)
  const openLennyMode = useCanvasStore(state => state.openLennyMode)
  const closeLennyMode = useCanvasStore(state => state.closeLennyMode)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)

  // ── Canvas refs ─────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentLayerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ offset: { x: 0, y: 0 }, scale: 0.7 })
  const [scaleDisplay, setScaleDisplay] = useState(0.7)

  const isDraggingRef = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x: 0, y: 0 })
  const pendingOffsetRef = useRef({ x: 0, y: 0 })
  const animationFrameId = useRef<number | null>(null)
  const dragRafId = useRef<number | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  const scaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWheelDeltaRef = useRef(0)
  const lastWheelClientRef = useRef<{ clientX: number; clientY: number } | null>(null)

  // ── Load nodes/edges on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      const [nodesRaw, edgesRaw] = await Promise.all([
        storageService.read(STORAGE_FILES.LENNY_NODES),
        storageService.read(STORAGE_FILES.LENNY_EDGES),
      ])
      let loadedNodes: Node[] = []
      let loadedEdges: EdgeType[] = []
      try { if (nodesRaw) loadedNodes = JSON.parse(nodesRaw) } catch { /* use seed */ }
      try { if (edgesRaw) loadedEdges = JSON.parse(edgesRaw) } catch { /* use seed */ }

      if (loadedNodes.length === 0) {
        loadedNodes = LENNY_SEED_NODES
        loadedEdges = LENNY_SEED_EDGES
        await Promise.all([
          storageService.write(STORAGE_FILES.LENNY_NODES, JSON.stringify(loadedNodes)),
          storageService.write(STORAGE_FILES.LENNY_EDGES, JSON.stringify(loadedEdges)),
        ])
      }
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setNodesLoaded(true)
    })()
  }, [isOpen])

  // ── 当 modal 关闭后，重新从文件加载最新节点（对话产生了新节点）─────────────
  useEffect(() => {
    if (!isOpen || isModalOpen) return
    ;(async () => {
      const nodesRaw = await storageService.read(STORAGE_FILES.LENNY_NODES)
      if (!nodesRaw) return
      try {
        const updated: Node[] = JSON.parse(nodesRaw)
        setNodes(updated)
      } catch { /* ignore */ }
    })()
  }, [isOpen, isModalOpen])

  // ── 进入/退出时同步 store 的 lenny 模式标记 ─────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      openLennyMode()
    } else {
      closeLennyMode()
    }
  }, [isOpen, openLennyMode, closeLennyMode])

  // ── applyTransform ──────────────────────────────────────────────────────────
  const applyTransform = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (contentLayerRef.current) {
      contentLayerRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
    }
    viewRef.current = { offset, scale }
  }, [])

  // ── Initial transform after nodes are set ───────────────────────────────────
  useEffect(() => {
    if (!nodesLoaded || !isOpen) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const initScale = 0.7
    const initOffset = {
      x: vw * 1.5 - 1920 * initScale,
      y: vh * 1.5 - 1200 * initScale,
    }
    applyTransform(initOffset, initScale)
    setScaleDisplay(initScale)
  }, [nodesLoaded, isOpen, applyTransform])

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
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
            const newScale = Math.max(0.15, Math.min(3, currentScale * factor))
            const rect = canvasEl.getBoundingClientRect()
            const mouseX = lastWheelClientRef.current.clientX - rect.left
            const mouseY = lastWheelClientRef.current.clientY - rect.top
            const { offset, scale: prevScale } = viewRef.current
            const scaleDiff = newScale / prevScale
            const vw = window.innerWidth
            const vh = window.innerHeight
            const newOffset = {
              x: (mouseX + vw) - scaleDiff * (mouseX + vw - offset.x),
              y: (mouseY + vh) - scaleDiff * (mouseY + vh - offset.y),
            }
            applyTransform(newOffset, newScale)
          }
          pendingWheelDeltaRef.current = 0
          wheelRafRef.current = null
        })
      }

      if (scaleTimerRef.current) clearTimeout(scaleTimerRef.current)
      scaleTimerRef.current = setTimeout(() => {
        setScaleDisplay(viewRef.current.scale)
        scaleTimerRef.current = null
      }, 120)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current)
      if (scaleTimerRef.current) clearTimeout(scaleTimerRef.current)
    }
  }, [isOpen, applyTransform])

  // ── Canvas drag (pan) ───────────────────────────────────────────────────────
  const startInertia = useCallback(() => {
    const damping = 0.94
    const step = () => {
      velocity.current.x *= damping
      velocity.current.y *= damping
      if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
        const { offset } = viewRef.current
        applyTransform({ x: offset.x + velocity.current.x, y: offset.y + velocity.current.y }, viewRef.current.scale)
        animationFrameId.current = requestAnimationFrame(step)
      } else {
        animationFrameId.current = null
      }
    }
    animationFrameId.current = requestAnimationFrame(step)
  }, [applyTransform])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target === canvasRef.current || target.classList.contains('lenny-dot-grid')) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      const { offset } = viewRef.current
      pendingOffsetRef.current = { ...offset }
      isDraggingRef.current = true
      canvasRef.current?.classList.add('!cursor-grabbing')
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
      lastPos.current = { x: e.clientX, y: e.clientY }
      velocity.current = { x: 0, y: 0 }
      const loop = () => {
        applyTransform(pendingOffsetRef.current, viewRef.current.scale)
        if (isDraggingRef.current) dragRafId.current = requestAnimationFrame(loop)
        else dragRafId.current = null
      }
      dragRafId.current = requestAnimationFrame(loop)
    }
  }, [applyTransform])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    velocity.current = { x: velocity.current.x * 0.2 + dx * 0.8, y: velocity.current.y * 0.2 + dy * 0.8 }
    lastPos.current = { x: e.clientX, y: e.clientY }
    pendingOffsetRef.current = { x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }
  }, [])

  const handleCanvasMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      canvasRef.current?.classList.remove('!cursor-grabbing')
      if (Math.abs(velocity.current.x) > 2 || Math.abs(velocity.current.y) > 2) {
        startInertia()
      }
    }
  }, [startInertia])

  // ── Node position tracking ──────────────────────────────────────────────────
  const handleNodePositionChange = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n))
  }, [])

  const handleNodeDragEnd = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, x, y } : n)
      storageService.write(STORAGE_FILES.LENNY_NODES, JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [])

  // ── 点击节点：开启对话（复用真实 AnswerModal）──────────────────────────────
  const handleContextSelect = useCallback((title: string) => {
    startConversation(title)
  }, [startConversation])

  // ── 输入框发送 ──────────────────────────────────────────────────────────────
  const handleInputSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    startConversation(trimmed)
  }, [inputValue, startConversation])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleInputSend()
    }
  }, [handleInputSend])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  // ── Node/Edge map for rendering ─────────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>()
    nodes.forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: '#f8f8fa' }}>

      {/* ── Top bar ── */}
      <div
        className="relative z-20 flex items-center gap-4 px-5 border-b border-gray-100"
        style={{ height: 56, backgroundColor: 'rgba(248,248,250,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回我的空间</span>
        </button>

        <div className="flex-1 flex items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shrink-0">
            L
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800">Lenny's Space</div>
            <div className="text-xs text-gray-400">Product · Growth · Career</div>
          </div>
        </div>

        <div className="text-[11px] font-bold text-gray-300" style={{ minWidth: 40, textAlign: 'right' }}>
          {Math.round(scaleDisplay * 100)}%
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        className="absolute inset-0 overflow-hidden lenny-dot-grid cursor-grab"
        style={{ top: 56 }}
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Content layer: 300vw × 300vh */}
        <div
          ref={contentLayerRef}
          style={{
            position: 'absolute',
            width: '300vw',
            height: '300vh',
            left: '-100vw',
            top: '-100vh',
            transformOrigin: '0 0',
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        >
          {/* SVG edges */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {edges.map(edge => {
              const src = nodeMap.get(edge.source)
              const tgt = nodeMap.get(edge.target)
              if (!src || !tgt) return null
              return (
                <Edge
                  key={edge.id}
                  sourceNode={src}
                  targetNode={tgt}
                  edgeType={edge.edgeType}
                  weight={edge.weight}
                  relation={edge.relation}
                  reason={edge.reason}
                  confidence={edge.confidence}
                />
              )
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
            <LennyNodeCard
              key={node.id}
              node={node}
              scale={scaleDisplay}
              onContextSelect={handleContextSelect}
              onPositionChange={handleNodePositionChange}
              onDragEnd={handleNodeDragEnd}
            />
          ))}
        </div>

        {/* 提示：无节点时 */}
        {nodesLoaded && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400 italic">Loading Lenny's knowledge…</p>
          </div>
        )}
      </div>

      {/* ── 底部输入框（与普通空间体验一致）── */}
      {!isModalOpen && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pb-6 px-4"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="w-full max-w-2xl">
            <motion.div
              layout
              className={`
                relative flex items-end gap-1.5 rounded-[28px]
                bg-white p-2.5
                border shadow-[0_8px_30px_rgba(0,0,0,0.08)]
                transition-all duration-200
                ${inputFocused ? 'border-gray-900 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' : 'border-gray-200'}
              `}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={handleInputKeyDown}
                placeholder="向 Lenny 提问…"
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none px-2 py-3.5 text-gray-800 placeholder-gray-400 min-h-[52px] max-h-[160px] text-[15px] leading-relaxed overflow-y-auto scrollbar-none"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
              />
              <button
                onClick={handleInputSend}
                disabled={!inputValue.trim()}
                className={`mb-1 p-2.5 rounded-2xl transition-all duration-200 flex items-center justify-center transform active:scale-95 ${
                  !inputValue.trim()
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-black shadow-sm'
                }`}
                aria-label="发送"
              >
                <ArrowUp className="w-5 h-5 stroke-[3px]" />
              </button>
            </motion.div>
            <div className="flex justify-center mt-2 text-[10px] text-gray-400 pointer-events-none select-none tracking-wide">
              点击节点直接提问，或在此输入 · Enter 发送
            </div>
          </div>
        </div>
      )}

      <style>{`
        .lenny-dot-grid {
          background-color: #f8f8fa;
          background-image: radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .lenny-dot-grid.\\!cursor-grabbing { cursor: grabbing !important; }
      `}</style>
    </div>
  )
}
