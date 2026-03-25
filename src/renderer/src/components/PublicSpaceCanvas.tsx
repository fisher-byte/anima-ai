/**
 * PublicSpaceCanvas — 统一公开记忆空间画布
 *
 * 将 Lenny / PG / Zhang / Wang 四个独立的 Space 画布组件合并为一个。
 * 差异通过 SpaceConfig 接口配置，保持各空间独立的视觉风格和数据隔离。
 *
 * 使用方式：
 *   <PublicSpaceCanvas config={LENNY_CONFIG} isOpen={...} onClose={...} />
 */
import {
  useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowUp, Trash2, Settings, History, X, ChevronRight, Paperclip } from 'lucide-react'
import { Edge } from './Edge'
import { SettingsModal } from './SettingsModal'
import { FileBrowserPanel } from './FileBrowserPanel'
import { storageService } from '../services/storageService'
import { ensureLingSiStorageSeeded } from '../services/lingsi'
import { useCanvasStore } from '../stores/canvasStore'
import { useForceSimulation } from '../hooks/useForceSimulation'
import { useT } from '../i18n'
import type { Node, Edge as EdgeType } from '@shared/types'
import { getMemoryCardVariant, MEMORY_VARIANT_STYLES } from '../utils/nodeCardVariants'

// ─── SpaceConfig ──────────────────────────────────────────────────────────────

export interface SpaceConfig {
  /** 种子节点 / 边 */
  seedNodes: Node[]
  seedEdges: EdgeType[]
  /** 存储文件 key */
  nodesFile: string
  edgesFile: string
  convsFile: string
  /** Store 方法名（用于进入/退出模式标记） */
  openModeKey: 'openLennyMode' | 'openPGMode' | 'openZhangMode' | 'openWangMode'
  closeModeKey: 'closeLennyMode' | 'closePGMode' | 'closeZhangMode' | 'closeWangMode'
  /** 种子节点 conversationId 前缀，用于判断是否为种子节点 */
  seedIdPrefix: string
  /** DOM 节点 id 前缀（`node-`, `pg-node-`, ...） */
  nodeIdPrefix: string
  /** 画布背景 CSS class */
  gridClass: string
  /** 头像文字 */
  avatarText: string
  /** 头像背景 Tailwind class */
  avatarBg: string
  /** 展示名称 */
  displayName: string
  /** hover 时的操作提示文字（已有历史 / 无历史） */
  hoverHasHistory: string
  hoverNoHistory: string
  /** hover 强调色 Tailwind class */
  hoverAccent: string
  /** hover 时卡片边框 Tailwind class */
  hoverBorder: string
  /** hover 阴影（CSS box-shadow value） */
  hoverShadow: string
  /** 输入框 placeholder i18n key（t.space 的属性名） */
  placeholderKey: keyof ReturnType<typeof useT>['t']['space']
  /** true = Lenny 用 useForceSimulation；false = PG/Zhang/Wang 用内置 simTick */
  useForceHook: boolean
  /** 是否支持灵思决策模式 */
  supportsDecisionMode?: boolean
  /** 决策模式绑定的 persona */
  decisionPersonaId?: 'lenny' | 'zhang'
}

// ─── 内置物理力常量（PG / Zhang / Wang 使用） ─────────────────────────────────

const SIM_NODE_REPEL = 18000
const SIM_NODE_REPEL_MAX_DIST = 700
const SIM_CENTER_GRAVITY = 0.00006
const SIM_DAMPING = 0.80
const SIM_MAX_VELOCITY = 2.0
const SIM_TEMPERATURE_KICK = 0.6
const SIM_TEMPERATURE_MIN = 0.12
const SIM_COOLING_RATE = 0.996

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

// ─── SpaceNodeCard ────────────────────────────────────────────────────────────

interface SpaceNodeCardProps {
  node: Node
  config: SpaceConfig
  onOpen: (node: Node) => void
  onDelete: (id: string) => void
  onPositionChange: (id: string, x: number, y: number) => void
  onDragStart?: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  scale: number
}

function SpaceNodeCard({ node, config, onOpen, onDelete, onPositionChange, onDragStart, onDragEnd, scale }: SpaceNodeCardProps) {
  const { t } = useT()
  const [isHovered, setIsHovered] = useState(false)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: node.x, y: node.y })
  const lastDragEndRef = useRef(0)

  const nodeElId = `${config.nodeIdPrefix}${node.id}`

  useLayoutEffect(() => {
    const el = document.getElementById(nodeElId)
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
      const el = document.getElementById(nodeElId)
      if (el) {
        const curX = parseFloat(el.style.left)
        const curY = parseFloat(el.style.top)
        if (!isNaN(curX) && !isNaN(curY)) positionRef.current = { x: curX, y: curY }
      }
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      onDragStart?.(node.id)
      return
    }

    if (isDraggingRef.current) {
      const ddx = e.clientX - mouseDownPosRef.current.x
      const ddy = e.clientY - mouseDownPosRef.current.y
      const newX = positionRef.current.x + ddx / scale
      const newY = positionRef.current.y + ddy / scale
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      positionRef.current = { x: newX, y: newY }
      const el = document.getElementById(nodeElId)
      if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px` }
      onPositionChange(node.id, newX, newY)
    }
  }, [node.id, nodeElId, scale, onPositionChange, onDragStart])

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
    '工作事业': '#3B82F6',
    '思考世界': '#8B5CF6',
    '关系情感': '#EC4899',
    '健康身体': '#10B981',
    '身心健康': '#10B981',
    '创意表达': '#F59E0B',
    '生活日常': '#94A3B8',
  }
  const accentColor = categoryColor[node.category ?? ''] ?? '#94A3B8'
  const memVariant = getMemoryCardVariant(node)
  const variantStyle = MEMORY_VARIANT_STYLES[memVariant]

  const isSeedNode = !node.conversationId || node.conversationId.startsWith(config.seedIdPrefix)

  return (
    <div
      id={nodeElId}
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
          memVariant !== 'neutral'
            ? `${variantStyle.shell} ${isHovered ? 'shadow-[0_8px_28px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_16px_rgba(0,0,0,0.07)]'}`
            : isHovered
              ? `shadow-[${config.hoverShadow}] ${config.hoverBorder}`
              : 'shadow-[0_2px_16px_rgba(0,0,0,0.06)] border-gray-100/80'
        }`}
        style={memVariant === 'neutral' ? { backgroundColor: 'rgba(255,255,255,0.92)' } : undefined}
      >
        <div className="p-5 pl-6 relative">
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
                className={config.hoverAccent}
              >
                {isSeedNode ? config.hoverNoHistory : config.hoverHasHistory}
              </motion.span>
            )}
          </div>
          {memVariant !== 'neutral' ? (
            <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${variantStyle.accentBar}`} />
          ) : (
            <div
              className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
              style={{ backgroundColor: accentColor, opacity: 0.25 }}
            />
          )}
        </div>
      </motion.div>

      {isHovered && node.nodeType === 'memory' && !isSeedNode && (
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

// ─── PublicSpaceCanvas ────────────────────────────────────────────────────────

interface PublicSpaceCanvasProps {
  config: SpaceConfig
  isOpen: boolean
  onClose: () => void
}

export function PublicSpaceCanvas({ config, isOpen, onClose }: PublicSpaceCanvasProps) {
  const { t } = useT()

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<EdgeType[]>([])
  const [nodesLoaded, setNodesLoaded] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isFilesOpen, setIsFilesOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; userMessage: string; createdAt: string }>>([])

  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const startConversation = useCanvasStore(state => state.startConversation)
  const openModalById = useCanvasStore(state => state.openModalById)
  const removeNode = useCanvasStore(state => state.removeNode)
  const openMode = useCanvasStore(state => state[config.openModeKey])
  const closeMode = useCanvasStore(state => state[config.closeModeKey])
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const lennyDecisionMode = useCanvasStore(state => state.lennyDecisionMode)
  const zhangDecisionMode = useCanvasStore(state => state.zhangDecisionMode)
  const setLennyDecisionMode = useCanvasStore(state => state.setLennyDecisionMode)
  const setZhangDecisionMode = useCanvasStore(state => state.setZhangDecisionMode)

  /** 从历史/节点打开对话时必须带上，否则刷新后 isLennyMode 可能为 false 会读错 jsonl */
  const modalSourceHint = useMemo((): 'lenny' | 'pg' | 'zhang' | 'wang' => {
    switch (config.openModeKey) {
      case 'openLennyMode': return 'lenny'
      case 'openPGMode': return 'pg'
      case 'openZhangMode': return 'zhang'
      case 'openWangMode': return 'wang'
    }
  }, [config.openModeKey])

  const activeDecisionMode = config.decisionPersonaId === 'zhang'
    ? zhangDecisionMode
    : lennyDecisionMode
  const setActiveDecisionMode = config.decisionPersonaId === 'zhang'
    ? setZhangDecisionMode
    : setLennyDecisionMode

  // ── useForceSimulation hook（React hooks 规则要求无条件调用）────────────────
  // 无论 useForceHook 是否为 true，hook 总是被调用。
  // 当 useForceHook = false 时，forceSim 对象存在但不会被实际使用。
  const forceSim = useForceSimulation(
    config.useForceHook
      ? { noSameAttract: true, noClusterForce: true, noStoreSync: true }
      : { noSameAttract: true, noClusterForce: true, noStoreSync: true }
  )

  // ── PG/Zhang/Wang 内置物理力模拟 ──────────────────────────────────────────
  const simNodesRef = useRef<SimNode[]>([])
  const simMapRef = useRef<Map<string, SimNode>>(new Map())
  const temperatureRef = useRef(0)
  const simRafRef = useRef<number | null>(null)

  const simTickRef = useRef<() => void>()
  simTickRef.current = () => {
    const simNodes = simNodesRef.current
    const temp = temperatureRef.current

    if (!config.useForceHook && simNodes.length > 1 && temp > 0) {
      let gcx = 0, gcy = 0
      for (const n of simNodes) { gcx += n.x; gcy += n.y }
      gcx /= simNodes.length; gcy /= simNodes.length

      for (let i = 0; i < simNodes.length; i++) {
        const a = simNodes[i]
        let fx = 0, fy = 0
        fx += (gcx - a.x) * SIM_CENTER_GRAVITY
        fy += (gcy - a.y) * SIM_CENTER_GRAVITY
        for (let j = 0; j < simNodes.length; j++) {
          if (i === j) continue
          const b = simNodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 1
          if (dist < SIM_NODE_REPEL_MAX_DIST) {
            const repel = SIM_NODE_REPEL / (dist * dist)
            fx -= (dx / dist) * repel
            fy -= (dy / dist) * repel
          }
        }
        a.vx = (a.vx + fx) * SIM_DAMPING
        a.vy = (a.vy + fy) * SIM_DAMPING
        const speed = Math.hypot(a.vx, a.vy)
        if (speed > SIM_MAX_VELOCITY) { a.vx = (a.vx / speed) * SIM_MAX_VELOCITY; a.vy = (a.vy / speed) * SIM_MAX_VELOCITY }
        a.x += a.vx * temp
        a.y += a.vy * temp
      }

      for (const n of simNodes) {
        const el = document.getElementById(`${config.nodeIdPrefix}${n.id}`)
        if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px` }
      }

      temperatureRef.current = Math.max(SIM_TEMPERATURE_MIN, temp * SIM_COOLING_RATE)
    }

    simRafRef.current = requestAnimationFrame(simTickRef.current!)
  }

  useEffect(() => {
    if (config.useForceHook) return
    simRafRef.current = requestAnimationFrame(simTickRef.current!)
    return () => { if (simRafRef.current) cancelAnimationFrame(simRafRef.current) }
  }, [config.useForceHook])

  const kickInternalSim = useCallback((storeNodes: Node[]) => {
    const prevMap = simMapRef.current
    const newNodes = storeNodes.map(n => {
      const prev = prevMap.get(n.id)
      return prev ? { ...prev, category: n.category ?? '其他' } : createSimNode(n)
    })
    simNodesRef.current = newNodes
    simMapRef.current = new Map(newNodes.map(n => [n.id, n]))
    temperatureRef.current = Math.max(temperatureRef.current, SIM_TEMPERATURE_KICK)
  }, [])

  // ── Canvas refs ───────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentLayerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ offset: { x: 0, y: 0 }, scale: 0.7 })
  const [scaleDisplay, setScaleDisplay] = useState(0.7)
  const initialNodesCenterRef = useRef({ x: 1920, y: 1200 })

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

  // ── Load nodes/edges on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      if (config.supportsDecisionMode) {
        await ensureLingSiStorageSeeded()
      }
      const [nodesRaw, edgesRaw] = await Promise.all([
        storageService.read(config.nodesFile),
        storageService.read(config.edgesFile),
      ])
      let loadedNodes: Node[] = []
      let loadedEdges: EdgeType[] = []
      try { if (nodesRaw) loadedNodes = JSON.parse(nodesRaw) } catch { /* use seed */ }
      try { if (edgesRaw) loadedEdges = JSON.parse(edgesRaw) } catch { /* use seed */ }

      if (loadedNodes.length === 0) {
        loadedNodes = config.seedNodes
        loadedEdges = config.seedEdges
        await Promise.all([
          storageService.write(config.nodesFile, JSON.stringify(loadedNodes)),
          storageService.write(config.edgesFile, JSON.stringify(loadedEdges)),
        ])
      } else if (config.useForceHook) {
        // Lenny：检测节点堆叠
        const seedMap = new Map(config.seedNodes.map(n => [n.id, n]))
        const cx = loadedNodes.reduce((s, n) => s + n.x, 0) / loadedNodes.length
        const cy = loadedNodes.reduce((s, n) => s + n.y, 0) / loadedNodes.length
        const clumpCount = loadedNodes.filter(n => Math.hypot(n.x - cx, n.y - cy) < 300).length
        if (clumpCount > loadedNodes.length * 0.3) {
          loadedNodes = loadedNodes.map(n => {
            const seed = seedMap.get(n.id)
            return seed ? { ...n, x: seed.x, y: seed.y } : n
          })
        }
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
      if (config.useForceHook) {
        forceSim.sync(loadedNodes, loadedEdges)
        forceSim.kick()
      } else {
        kickInternalSim(loadedNodes)
      }
    })()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── modal 关闭后重新加载节点 ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isModalOpen) return
    ;(async () => {
      const [nodesRaw, edgesRaw] = await Promise.all([
        storageService.read(config.nodesFile),
        storageService.read(config.edgesFile),
      ])
      if (!nodesRaw) return
      try {
        const updated: Node[] = JSON.parse(nodesRaw)
        const updatedEdges: EdgeType[] = edgesRaw ? JSON.parse(edgesRaw) : edges
        setNodes(updated)
        setEdges(updatedEdges)
        if (config.useForceHook) {
          forceSim.sync(updated, updatedEdges)
          forceSim.kick()
        } else {
          kickInternalSim(updated)
        }
      } catch { /* ignore */ }
    })()
  }, [isOpen, isModalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 进入/退出 Space 模式标记 ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) openMode()
    else closeMode()
  }, [isOpen, openMode, closeMode])

  // ── 历史对话加载 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHistoryOpen) return
    ;(async () => {
      const raw = await storageService.read(config.convsFile)
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
  }, [isHistoryOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 每 2 秒同步 force sim DOM → state (Lenny) ────────────────────────────
  useEffect(() => {
    if (!isOpen || !config.useForceHook) return
    const id = setInterval(() => {
      setNodes(prev => prev.map(n => {
        const el = document.getElementById(`${config.nodeIdPrefix}${n.id}`)
        if (!el) return n
        const x = parseFloat(el.style.left)
        const y = parseFloat(el.style.top)
        if (isNaN(x) || isNaN(y)) return n
        return (Math.abs(x - n.x) > 1 || Math.abs(y - n.y) > 1) ? { ...n, x, y } : n
      }))
    }, 2000)
    return () => clearInterval(id)
  }, [isOpen, config.useForceHook, config.nodeIdPrefix])

  // ── 每 2 秒 flush 内置 sim → state (PG/Zhang/Wang) ───────────────────────
  useEffect(() => {
    if (!isOpen || config.useForceHook) return
    const id = setInterval(() => {
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
    }, 2000)
    return () => clearInterval(id)
  }, [isOpen, config.useForceHook])

  // ── applyTransform ───────────────────────────────────────────────────────
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
    applyTransform({
      x: vw / 2 - cx * initScale + vw,
      y: vh / 2 - cy * initScale + vh,
    }, initScale)
    setScaleDisplay(initScale)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesLoaded, isOpen, applyTransform])

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null }
      lastWheelClientRef.current = { clientX: e.clientX, clientY: e.clientY }
      pendingWheelDeltaRef.current += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY

      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(() => {
          const canvasEl = canvasRef.current
          if (lastWheelClientRef.current && canvasEl) {
            const currentScale = viewRef.current.scale
            const newScale = Math.max(0.15, Math.min(3, currentScale * Math.pow(1.001, -pendingWheelDeltaRef.current)))
            const rect = canvasEl.getBoundingClientRect()
            const mouseX = lastWheelClientRef.current.clientX - rect.left
            const mouseY = lastWheelClientRef.current.clientY - rect.top
            const { offset, scale: prevScale } = viewRef.current
            const scaleDiff = newScale / prevScale
            const vw = window.innerWidth; const vh = window.innerHeight
            applyTransform({
              x: (mouseX + vw) - scaleDiff * (mouseX + vw - offset.x),
              y: (mouseY + vh) - scaleDiff * (mouseY + vh - offset.y),
            }, newScale)
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

  // ── Canvas drag (pan) ─────────────────────────────────────────────────────
  const startInertia = useCallback(() => {
    const step = () => {
      velocity.current.x *= 0.94
      velocity.current.y *= 0.94
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
    if (target === canvasRef.current || target.classList.contains(config.gridClass)) {
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
  }, [applyTransform, config.gridClass])

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
      if (Math.abs(velocity.current.x) > 2 || Math.abs(velocity.current.y) > 2) startInertia()
    }
  }, [startInertia])

  // ── Node drag handlers ────────────────────────────────────────────────────
  const handleNodePositionChange = useCallback((id: string, x: number, y: number) => {
    if (config.useForceHook) forceSim.updateSimNode(id, x, y)
    else {
      const n = simMapRef.current.get(id)
      if (n) { n.x = x; n.y = y }
    }
  }, [config.useForceHook, forceSim])

  const handleNodeDragStart = useCallback((id: string) => {
    if (config.useForceHook) forceSim.setDragging(id)
  }, [config.useForceHook, forceSim])

  const handleNodeDragEnd = useCallback((id: string, x: number, y: number) => {
    if (config.useForceHook) {
      forceSim.setDragging(null)
      forceSim.updateSimNode(id, x, y)
      forceSim.kick()
    } else {
      const n = simMapRef.current.get(id)
      if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0 }
    }
    setNodes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, x, y } : n)
      storageService.write(config.nodesFile, JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [config.useForceHook, config.nodesFile, forceSim])

  // ── Node open / delete ────────────────────────────────────────────────────
  const handleNodeOpen = useCallback((node: Node) => {
    const isSeedNode = !node.conversationId || node.conversationId.startsWith(config.seedIdPrefix)
    if (!isSeedNode) openModalById(node.conversationId, undefined, modalSourceHint)
    else startConversation(node.title)
  }, [config.seedIdPrefix, openModalById, startConversation, modalSourceHint])

  const handleDeleteRequest = useCallback((id: string) => setDeleteConfirmId(id), [])

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

  // ── Input ─────────────────────────────────────────────────────────────────
  const handleInputSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    startConversation(trimmed)
  }, [inputValue, startConversation])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleInputSend() }
  }, [handleInputSend])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }, [])

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>()
    nodes.forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  if (!isOpen) return null

  const confirmTargetNode = deleteConfirmId ? nodes.find(n => n.id === deleteConfirmId) : null
  const placeholder = t.space[config.placeholderKey] as string

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: '#f8f8fa' }}>

      {/* ── Top bar ── */}
      <div
        className="relative z-20 flex items-center gap-4 px-5 border-b border-stone-200/80"
        style={{ height: 56, backgroundColor: 'rgba(248,248,250,0.97)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-all shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.space.backToMySpace}</span>
        </button>

        <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-full ${config.avatarBg} flex items-center justify-center text-white font-semibold text-[11px] shrink-0`}>
            {config.avatarText}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 leading-tight">{config.displayName}</div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5 flex items-center gap-1.5">
              <span>{t.space.talkTo}</span>
              <span className="text-gray-200">·</span>
              <span>{t.space.knowsYourMemory}</span>
            </div>
          </div>
        </div>

        {config.supportsDecisionMode && (
          <div className="flex items-center rounded-xl border border-gray-200 bg-white p-1 shrink-0">
            <button
              onClick={() => setActiveDecisionMode('normal')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                activeDecisionMode === 'normal'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.space.decisionModeNormal}
            </button>
            <button
              onClick={() => setActiveDecisionMode('decision')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                activeDecisionMode === 'decision'
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.space.decisionModeLingSi}
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-bold text-gray-300 mr-2">{Math.round(scaleDisplay * 100)}%</span>
          <button
            onClick={() => { setIsFilesOpen(v => !v); setIsHistoryOpen(false) }}
            className={`p-2 rounded-xl transition-colors ${isFilesOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
            title="文件列表"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setIsHistoryOpen(v => !v); setIsFilesOpen(false) }}
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
        className={`absolute inset-0 overflow-hidden ${config.gridClass} cursor-grab`}
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
            <SpaceNodeCard
              key={node.id}
              node={node}
              config={config}
              scale={scaleDisplay}
              onOpen={handleNodeOpen}
              onDelete={handleDeleteRequest}
              onPositionChange={handleNodePositionChange}
              onDragStart={handleNodeDragStart}
              onDragEnd={handleNodeDragEnd}
            />
          ))}
        </div>

        {nodesLoaded && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400 italic">{t.space.loading(config.displayName)}</p>
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
              <span className="text-sm font-semibold text-gray-700">{t.space.historyTitle(config.displayName)}</span>
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
                    onClick={() => { openModalById(item.id, undefined, modalSourceHint); setIsHistoryOpen(false) }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] text-gray-700 leading-snug line-clamp-2 flex-1">{item.userMessage}</p>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5 transition-colors" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : ''}</p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 文件列表面板 ── */}
      <FileBrowserPanel
        isOpen={isFilesOpen}
        onClose={() => setIsFilesOpen(false)}
      />

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
                placeholder={placeholder}
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
              {t.space.clickHint}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .${config.gridClass} {
          background-color: #f8f8fa;
          background-image: radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .${config.gridClass}.\\!cursor-grabbing { cursor: grabbing !important; }
      `}</style>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}
