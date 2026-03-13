/**
 * WangSpaceCanvas — 王慧文沉浸式记忆画布
 *
 * 与 PGSpaceCanvas 结构完全对称，换了：
 * - 数据源：WANG_SEED_NODES / WANG_SEED_EDGES（from @shared/wangData）
 * - Storage 文件：wang-nodes.json / wang-conversations.jsonl / wang-edges.json
 * - 主题色：emerald/teal 渐变
 * - 系统 prompt：WANG_SYSTEM_PROMPT
 *
 * 数据来源：anima-base / people/product/wang-huiwen/
 * https://github.com/fisher-byte/anima-base
 */
import {
  useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowUp, Trash2, Settings, History, X, ChevronRight } from 'lucide-react'
import { Edge } from './Edge'
import { SettingsModal } from './SettingsModal'
import { storageService } from '../services/storageService'
import { WANG_SEED_NODES, WANG_SEED_EDGES } from '@shared/wangData'
import { STORAGE_FILES } from '@shared/constants'
import { useCanvasStore } from '../stores/canvasStore'
import { useT } from '../i18n'
import type { Node, Edge as EdgeType } from '@shared/types'

// ─── 物理力常量 ──────────────────────────────────────────────────────────────
const NODE_REPEL          = 18000
const NODE_REPEL_MAX_DIST = 700
const CENTER_GRAVITY      = 0.00006
const DAMPING             = 0.80
const MAX_VELOCITY        = 2.0
const TEMPERATURE_KICK    = 0.6
const TEMPERATURE_MIN     = 0.12
const COOLING_RATE        = 0.996

// ─── WangNodeCard ─────────────────────────────────────────────────────────────

interface WangNodeCardProps {
  node: Node
  onOpen: (node: Node) => void
  onDelete: (id: string) => void
  onPositionChange: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  scale: number
}

function WangNodeCard({ node, onOpen, onDelete, onPositionChange, onDragEnd, scale }: WangNodeCardProps) {
  const { t } = useT()
  const [isHovered, setIsHovered] = useState(false)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  useLayoutEffect(() => {
    const el = document.getElementById(`wang-node-${node.id}`)
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
      const el = document.getElementById(`wang-node-${node.id}`)
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
      const el = document.getElementById(`wang-node-${node.id}`)
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
    onOpen(node)
  }, [node, onOpen])

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(node.id)
  }, [node.id, onDelete])

  const categoryColor: Record<string, string> = {
    '工作事业': '#10B981',
    '思考世界': '#0D9488',
    '关系情感': '#EC4899',
    '身心健康': '#3B82F6',
    '创意表达': '#F59E0B',
    '生活日常': '#94A3B8',
  }
  const accentColor = categoryColor[node.category ?? ''] ?? '#94A3B8'

  return (
    <div
      id={`wang-node-${node.id}`}
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
            ? 'shadow-[0_8px_32px_rgba(16,185,129,0.14)] border-emerald-100'
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
            {(node.keywords ?? []).slice(0, 3).map((kw, i) => (
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
                className="text-emerald-400/70"
              >
                {node.conversationId ? 'View history →' : 'Ask Wang →'}
              </motion.span>
            )}
          </div>
          <div
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
            style={{ backgroundColor: accentColor, opacity: 0.25 }}
          />
        </div>
      </motion.div>

      {/* 悬浮删除按钮（仅非种子节点可删） */}
      {isHovered && node.nodeType === 'memory' && !node.conversationId?.startsWith('wang-seed-') && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={handleDeleteClick}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors z-20"
          title={t.space.deleteNodeTooltip}
        >
          <Trash2 className="w-3 h-3" />
        </motion.button>
      )}
    </div>
  )
}

// ─── 物理力模拟 ───────────────────────────────────────────────────────────────

interface SimNode {
  id: string
  x: number
  y: number
  category: string
  vx: number
  vy: number
}

function createSimNode(n: Node): SimNode {
  return { id: n.id, x: n.x, y: n.y, category: n.category ?? '其他', vx: 0, vy: 0 }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WangSpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function WangSpaceCanvas({ isOpen, onClose }: WangSpaceCanvasProps) {
  const { t } = useT()
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<EdgeType[]>([])
  const [nodesLoaded, setNodesLoaded] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; userMessage: string; createdAt: string }>>([])

  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const startConversation = useCanvasStore(state => state.startConversation)
  const openModalById = useCanvasStore(state => state.openModalById)
  const removeNode = useCanvasStore(state => state.removeNode)
  const openWangMode = useCanvasStore(state => state.openWangMode)
  const closeWangMode = useCanvasStore(state => state.closeWangMode)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)

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

  const simNodesRef = useRef<SimNode[]>([])
  const simMapRef = useRef<Map<string, SimNode>>(new Map())
  const temperatureRef = useRef(0)
  const simRafRef = useRef<number | null>(null)

  const initialNodesCenterRef = useRef({ x: 1920, y: 1200 })

  // ── 物理 tick ───────────────────────────────────────────────────────────────
  const simTickRef = useRef<() => void>()
  simTickRef.current = () => {
    const simNodes = simNodesRef.current
    const temp = temperatureRef.current

    if (simNodes.length > 1 && temp > 0) {
      let gcx = 0, gcy = 0
      for (const n of simNodes) { gcx += n.x; gcy += n.y }
      gcx /= simNodes.length; gcy /= simNodes.length

      for (let i = 0; i < simNodes.length; i++) {
        const a = simNodes[i]
        let fx = 0, fy = 0

        fx += (gcx - a.x) * CENTER_GRAVITY
        fy += (gcy - a.y) * CENTER_GRAVITY

        for (let j = 0; j < simNodes.length; j++) {
          if (i === j) continue
          const b = simNodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 1

          if (dist < NODE_REPEL_MAX_DIST) {
            const repel = NODE_REPEL / (dist * dist)
            fx -= (dx / dist) * repel
            fy -= (dy / dist) * repel
          }
        }

        a.vx = (a.vx + fx) * DAMPING
        a.vy = (a.vy + fy) * DAMPING
        const speed = Math.hypot(a.vx, a.vy)
        if (speed > MAX_VELOCITY) { a.vx = (a.vx / speed) * MAX_VELOCITY; a.vy = (a.vy / speed) * MAX_VELOCITY }
        a.x += a.vx * temp
        a.y += a.vy * temp
      }

      for (const n of simNodes) {
        const el = document.getElementById(`wang-node-${n.id}`)
        if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px` }
      }

      temperatureRef.current = Math.max(TEMPERATURE_MIN, temp * COOLING_RATE)
    }

    simRafRef.current = requestAnimationFrame(simTickRef.current!)
  }

  useEffect(() => {
    simRafRef.current = requestAnimationFrame(simTickRef.current!)
    return () => { if (simRafRef.current) cancelAnimationFrame(simRafRef.current) }
  }, [])

  const kickSim = useCallback((storeNodes: Node[]) => {
    const prevMap = simMapRef.current
    const newNodes = storeNodes.map(n => {
      const prev = prevMap.get(n.id)
      return prev
        ? { ...prev, category: n.category ?? '其他' }
        : createSimNode(n)
    })
    simNodesRef.current = newNodes
    simMapRef.current = new Map(newNodes.map(n => [n.id, n]))
    temperatureRef.current = Math.max(temperatureRef.current, TEMPERATURE_KICK)
  }, [])

  const flushSimToState = useCallback(() => {
    setNodes(prev => {
      const needsUpdate = prev.some(n => {
        const s = simMapRef.current.get(n.id)
        return s && (Math.abs(s.x - n.x) > 1 || Math.abs(s.y - n.y) > 1)
      })
      if (!needsUpdate) return prev
      return prev.map(n => {
        const s = simMapRef.current.get(n.id)
        return s ? { ...n, x: s.x, y: s.y } : n
      })
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(flushSimToState, 2000)
    return () => clearInterval(id)
  }, [isOpen, flushSimToState])

  // ── Load nodes/edges on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      const [nodesRaw, edgesRaw] = await Promise.all([
        storageService.read(STORAGE_FILES.WANG_NODES),
        storageService.read(STORAGE_FILES.WANG_EDGES),
      ])
      let loadedNodes: Node[] = []
      let loadedEdges: EdgeType[] = []
      try { if (nodesRaw) loadedNodes = JSON.parse(nodesRaw) } catch { /* use seed */ }
      try { if (edgesRaw) loadedEdges = JSON.parse(edgesRaw) } catch { /* use seed */ }

      if (loadedNodes.length === 0) {
        loadedNodes = WANG_SEED_NODES
        loadedEdges = WANG_SEED_EDGES
        await Promise.all([
          storageService.write(STORAGE_FILES.WANG_NODES, JSON.stringify(loadedNodes)),
          storageService.write(STORAGE_FILES.WANG_EDGES, JSON.stringify(loadedEdges)),
        ])
      }
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      if (loadedNodes.length > 0) {
        initialNodesCenterRef.current = {
          x: loadedNodes.reduce((s, n) => s + n.x, 0) / loadedNodes.length,
          y: loadedNodes.reduce((s, n) => s + n.y, 0) / loadedNodes.length,
        }
      }
      setNodesLoaded(true)
      kickSim(loadedNodes)
    })()
  }, [isOpen, kickSim])

  useEffect(() => {
    if (!isOpen || isModalOpen) return
    ;(async () => {
      const nodesRaw = await storageService.read(STORAGE_FILES.WANG_NODES)
      if (!nodesRaw) return
      try {
        const updated: Node[] = JSON.parse(nodesRaw)
        setNodes(updated)
        kickSim(updated)
      } catch { /* ignore */ }
    })()
  }, [isOpen, isModalOpen, kickSim])

  useEffect(() => {
    if (isOpen) openWangMode()
    else closeWangMode()
  }, [isOpen, openWangMode, closeWangMode])

  useEffect(() => {
    if (!isHistoryOpen) return
    ;(async () => {
      const raw = await storageService.read(STORAGE_FILES.WANG_CONVERSATIONS)
      if (!raw) return
      const items = raw.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean).reverse()
      setHistoryItems(items.map((c: any) => ({
        id: c.id,
        userMessage: c.userMessage ?? t.space.noContent,
        createdAt: c.createdAt ?? '',
      })))
    })()
  }, [isHistoryOpen])

  // ── applyTransform ──────────────────────────────────────────────────────────
  const applyTransform = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (contentLayerRef.current) {
      contentLayerRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
    }
    viewRef.current = { offset, scale }
  }, [])

  useEffect(() => {
    if (!nodesLoaded || !isOpen) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const initScale = 0.7
    const cx = initialNodesCenterRef.current.x
    const cy = initialNodesCenterRef.current.y
    const initOffset = {
      x: vw / 2 - cx * initScale + vw,
      y: vh / 2 - cy * initScale + vh,
    }
    applyTransform(initOffset, initScale)
    setScaleDisplay(initScale)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (target === canvasRef.current || target.classList.contains('wang-dot-grid')) {
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
    const s = simMapRef.current.get(id)
    if (s) { s.x = x; s.y = y; s.vx = 0; s.vy = 0 }
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n))
  }, [])

  const handleNodeDragEnd = useCallback((id: string, x: number, y: number) => {
    const s = simMapRef.current.get(id)
    if (s) { s.x = x; s.y = y; s.vx = 0; s.vy = 0 }
    setNodes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, x, y } : n)
      storageService.write(STORAGE_FILES.WANG_NODES, JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [])

  // ── 点击节点：种子节点→新建对话，用户节点→查看历史 ──────────────────────────
  const handleNodeOpen = useCallback((node: Node) => {
    const isSeedNode = !node.conversationId || node.conversationId.startsWith('wang-seed-')
    if (!isSeedNode) {
      openModalById(node.conversationId)
    } else {
      startConversation(node.title)
    }
  }, [openModalById, startConversation])

  // ── 删除节点 ────────────────────────────────────────────────────────────────
  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteConfirmId(id)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    setNodes(prev => {
      const updated = prev.filter(n => n.id !== id)
      simNodesRef.current = simNodesRef.current.filter(n => n.id !== id)
      simMapRef.current.delete(id)
      return updated
    })
    await removeNode(id)
  }, [deleteConfirmId, removeNode])

  // ── 输入框发送 ──────────────────────────────────────────────────────────────
  const handleInputSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
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

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>()
    nodes.forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  if (!isOpen) return null

  const confirmTargetNode = deleteConfirmId ? nodes.find(n => n.id === deleteConfirmId) : null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: '#f8f8fa' }}>

      {/* ── Top bar ── */}
      <div
        className="relative z-20 flex items-center gap-4 px-5 border-b border-gray-100"
        style={{ height: 56, backgroundColor: 'rgba(248,248,250,0.97)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.space.backToMySpace}</span>
        </button>

        <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">
            王
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 leading-tight">王慧文</div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5 flex items-center gap-1.5">
              <span>{t.space.talkTo}</span>
              <span className="text-gray-200">·</span>
              <span>{t.space.knowsYourMemory}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-bold text-gray-300 mr-2">{Math.round(scaleDisplay * 100)}%</span>
          <button
            onClick={() => setIsHistoryOpen(v => !v)}
            className={`p-2 rounded-xl transition-colors ${isHistoryOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
            title={t.space.conversationHistory}
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            title={t.space.settingsTooltip}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        className="absolute inset-0 overflow-hidden wang-dot-grid cursor-grab"
        style={{ top: 56 }}
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
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

          {nodes.map(node => (
            <WangNodeCard
              key={node.id}
              node={node}
              scale={scaleDisplay}
              onOpen={handleNodeOpen}
              onDelete={handleDeleteRequest}
              onPositionChange={handleNodePositionChange}
              onDragEnd={handleNodeDragEnd}
            />
          ))}
        </div>

        {nodesLoaded && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400 italic">{t.space.loading('王慧文')}</p>
          </div>
        )}
      </div>

      {/* ── 历史对话侧边栏 ── */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed left-0 z-[110] flex flex-col bg-white/95 backdrop-blur-md border-r border-gray-100 shadow-xl"
            style={{ top: 56, bottom: 0, width: 280 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">{t.space.historyTitle('王慧文')}</span>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {historyItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-8 px-4">{t.space.noHistory}</p>
              ) : (
                historyItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { openModalById(item.id); setIsHistoryOpen(false) }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] text-gray-700 leading-snug line-clamp-2 flex-1">{item.userMessage}</p>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5 transition-colors" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4"
          >
            <h3 className="font-semibold text-gray-800 mb-2">{t.space.deleteNodeTitle}</h3>
            <p className="text-sm text-gray-500 mb-5">
              {confirmTargetNode?.title ?? ''}
              <br />{t.space.deleteNodeWarning}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {t.space.deleteCancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm text-white hover:bg-red-600 transition-colors"
              >
                {t.space.deleteConfirm}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 底部输入框 ── */}
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
                placeholder={t.space.wangPlaceholder}
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
                aria-label="Send"
              >
                <ArrowUp className="w-5 h-5 stroke-[3px]" />
              </button>
            </motion.div>
            <div className="flex justify-center mt-2 text-[10px] text-gray-400 pointer-events-none select-none tracking-wide">
              {t.space.clickHint}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .wang-dot-grid {
          background-color: #f8f8fa;
          background-image: radial-gradient(circle, rgba(16,185,129,0.1) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .wang-dot-grid.\\!cursor-grabbing { cursor: grabbing !important; }
      `}</style>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}
