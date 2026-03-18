/**
 * Canvas — 画布主组件
 *
 * 职责：画布视口管理（平移/缩放/惯性滚动）+ 节点/连线渲染 + 全局控件（搜索/设置/侧栏）
 *
 * 关键设计：
 *   - 所有变换通过 viewState { x, y, scale } 统一管理，存于 useRef 避免重渲染
 *   - 节点拖拽和画布平移用 pointerId capture 区分，避免事件冲突
 *   - LOD (Level of Detail)：scale < 0.3 时隐藏 Edge，< 0.5 时 NodeCard 降级渲染
 *   - MemoryLines：高亮节点 → 输入框的 SVG 虚线，表达记忆引用关系
 *   - getClusters：按分类聚合节点，供 ClusterLabel 宏观视图使用
 *
 * 子组件（均通过 props 或 canvasStore 解耦）：
 *   NodeCard / Edge / MemoryLines / ClusterLabel / AmbientBackground
 *   ConversationSidebar / SearchPanel / SettingsModal / ImportMemoryModal
 */
import { useState, useRef, useCallback, useMemo, useEffect, createContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Search, History, Minus, Plus, LayoutGrid, BrainCircuit, Sparkles, Clock, GitMerge, Github, PlusCircle, Trash2, FolderOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { useForceSimulation, type ForceSimulationAPI } from '../hooks/useForceSimulation'
import { NodeCard } from './NodeCard'
import { ImportMemoryModal } from './ImportMemoryModal'
import { NodeTimelinePanel } from './NodeTimelinePanel'
import { Edge } from './Edge'
import { ConversationSidebar } from './ConversationSidebar'
import { SearchPanel } from './SearchPanel'
import { SettingsModal } from './SettingsModal'
import { LennySpaceCanvas } from './LennySpaceCanvas'
import { PGSpaceCanvas } from './PGSpaceCanvas'
import { ZhangSpaceCanvas } from './ZhangSpaceCanvas'
import { WangSpaceCanvas } from './WangSpaceCanvas'
import { CustomSpaceCanvas } from './CustomSpaceCanvas'
import { CreateCustomSpaceModal } from './CreateCustomSpaceModal'
import { FileBrowserPanel } from './FileBrowserPanel'

import { AmbientBackground } from './AmbientBackground'
import { ClusterLabel } from './ClusterLabel'
import { useToast } from './GlobalUI'
import { TimelineView } from './TimelineView'
import { getAuthToken } from '../services/storageService'
import { DECISION_RECORDS_UPDATED_EVENT, listOngoingDecisionItems, type OngoingDecisionItem } from '../services/decisionRecords'
import { useT } from '../i18n'
import type { Node as CanvasNode } from '@shared/types'

/** 让 NodeCard 能访问 force sim API（setDragging / kick） */
export const ForceSimContext = createContext<ForceSimulationAPI | null>(null)

/** 记忆引用连线：从高亮节点画虚线到输入框位置 */
function MemoryLines({
  nodes,
  highlightedNodeIds,
  getViewState,
}: {
  nodes: CanvasNode[]
  highlightedNodeIds: string[]
  getViewState: () => { offset: { x: number; y: number }; scale: number }
}) {
  // 订阅 store offset/scale 来触发重渲染（store 写入有 debounce，但能保证最终一致）
  // 读取时用 getViewState() 获取 viewRef 中的实时值，避免 debounce 期间的短暂偏差
  useCanvasStore(state => state.offset)
  useCanvasStore(state => state.scale)

  if (highlightedNodeIds.length === 0) return null

  const { offset, scale } = getViewState()

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  // 输入框固定在底部中央
  const targetX = vw / 2
  const targetY = vh - 80

  // contentLayer CSS: left=-vw, top=-vh, transform=translate(offset.x, offset.y) scale(scale), transformOrigin='0 0'
  // CSS transform 从右到左：先 scale 再 translate（translate 值不受 scale 影响）
  // 节点屏幕坐标：screenX = node.x * scale + offset.x - vw
  //              screenY = node.y * scale + offset.y - vh
  const NODE_W = 208  // NodeCard w-52
  const NODE_H = 120  // 节点大致高度

  // 极简：所有记忆引用线统一为单一极淡白色，不用颜色区分分类
  const LINE_COLOR = 'rgba(255,255,255,0.15)'

  const lines = highlightedNodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is CanvasNode => !!n)
    .map(node => {
      const nx = node.x * scale + offset.x - vw
      const ny = node.y * scale + offset.y - vh
      const sx = nx + (NODE_W / 2) * scale
      const sy = ny + (NODE_H / 2) * scale
      return { id: node.id, sx, sy }
    })
    // 节点中心必须在可视区内才画线，避免"悬空线"（留宽裕边距）
    .filter(({ sx, sy }) => sx >= -100 && sx <= vw + 100 && sy >= -100 && sy <= vh)
    .slice(0, 3) // 最多显示 3 条，避免连线过多造成噪音

  if (lines.length === 0) return null

  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 25 }}
    >
      <defs>
        {lines.map(({ id }) => (
          <marker key={`marker-${id}`} id={`mem-arrow-${id}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <circle cx="3" cy="3" r="2" fill={LINE_COLOR} />
          </marker>
        ))}
      </defs>
      {lines.map(({ id, sx, sy }, i) => (
        <motion.path
          key={id}
          d={`M ${sx} ${sy} L ${targetX} ${targetY}`}
          stroke={LINE_COLOR}
          strokeWidth={1}
          strokeDasharray="4 6"
          fill="none"
          markerEnd={`url(#mem-arrow-${id})`}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
        />
      ))}
    </svg>
  )
}

// Helper for cluster calculation — 读取 DOM 实时坐标（force sim 直接写 DOM，store 坐标滞后）
function getClusters(nodes: any[]) {
  const map = new Map<string, { x: number; y: number; count: number; color: string }>()
  nodes.forEach(n => {
    const cat = n.category || '其他'
    // 优先读 DOM 当前坐标（force sim 可能已移动但未写 store）
    const el = document.getElementById(`node-${n.id}`)
    const nx = el ? (parseFloat(el.style.left) || n.x) : n.x
    const ny = el ? (parseFloat(el.style.top) || n.y) : n.y
    const curr = map.get(cat) || { x: 0, y: 0, count: 0, color: n.color || '#E2E8F0' }
    curr.x += nx
    curr.y += ny
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
  const { t } = useT()
  // 細粒度订阅：只订阅会引起 UI 变化的数据，函数用 getState() 避免触发重渲染
  const nodes = useCanvasStore(state => state.nodes)
  const edges = useCanvasStore(state => state.edges)
  const newLogicalEdgeIds = useCanvasStore(state => state.newLogicalEdgeIds)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const highlightedNodeIds = useCanvasStore(state => state.highlightedNodeIds)
  const nodesLoaded = useCanvasStore(state => state.nodesLoaded)
  const lastError = useCanvasStore(state => state.lastError)
  const clearLastError = useCanvasStore(state => state.clearLastError)
  const isTimelineOpen = useCanvasStore(state => state.isTimelineOpen)
  const nodeGraphRebuild = useCanvasStore(state => state.nodeGraphRebuild)
  const rebuildNodeGraph = useCanvasStore(state => state.rebuildNodeGraph)
  // 订阅 profile.rules 长度，用于进化基因红点（不用节点数量，避免虚触发）
  const profileRulesCount = useCanvasStore(state => state.profile?.rules?.length ?? 0)
  const customSpaces = useCanvasStore(state => state.customSpaces)
  const openModal = useCanvasStore(state => state.openModal)

  // 空画布欢迎语（个性化，当天缓存）
  const [welcomeText, setWelcomeText] = useState<string | null>(null)
  // actions 从 getState() 取，不订阅 store，不触发重渲染
  const setOffset = useCallback((o: {x:number;y:number}) => useCanvasStore.getState().setOffset(o), [])
  const setScale = useCallback((s: number) => useCanvasStore.getState().setScale(s), [])
  const resetView = useCallback(() => useCanvasStore.getState().resetView(), [])

  // 力模拟引擎
  const forceSim = useForceSimulation()

  const toast = useToast()

  // 监听后台静默错误并 toast 给用户
  useEffect(() => {
    if (lastError) {
      toast.error(lastError)
      clearLastError()
    }
  }, [lastError, toast, clearLastError])

  // offset/scale 完全用 ref 管理，不走 React state，避免 zoom 触发任何重渲染
  const viewRef = useRef({ offset: useCanvasStore.getState().offset, scale: useCanvasStore.getState().scale })
  const contentLayerRef = useRef<HTMLDivElement>(null)
  // 仅用于工具栏百分比显示（低频更新）
  const [scaleDisplay, setScaleDisplay] = useState(useCanvasStore.getState().scale)

  // 提前声明所有 "操作中" ref，供 subscription guard 使用
  const animationFrameId = useRef<number | null>(null)  // 惯性动画
  const dragRafId = useRef<number | null>(null)          // 画布拖拽 RAF loop
  const wheelRafRef = useRef<number | null>(null)        // 滚轮缩放 RAF
  const scaleDisplayRafRef = useRef<number | null>(null)  // 缩放 debounced store 写入

  // 订阅 store 的 offset/scale 外部变更（如 focusNode、loadNodes 触发），同步 viewRef 和 DOM
  // isDraggingRef / isTouchingRef / isWheelActiveRef 有值时跳过，避免与用户操作冲突
  // isLocalWriteRef：本组件自己写 store 时置 true，防止 subscription 回读自己写的值
  const isLocalWriteRef = useRef(false)
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe((state) => {
      // 任何本地操作（拖拽/缩放/惯性/wheel）进行中时跳过，防止闪回
      if (isDraggingRef.current || isTouchingRef.current || isLocalWriteRef.current) return
      if (animationFrameId.current || dragRafId.current || wheelRafRef.current || scaleDisplayRafRef.current) return
      const { offset, scale } = state
      if (
        viewRef.current.offset.x !== offset.x ||
        viewRef.current.offset.y !== offset.y ||
        viewRef.current.scale !== scale
      ) {
        viewRef.current = { offset, scale }
        if (contentLayerRef.current) {
          contentLayerRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
        }
      }
    })
    return unsubscribe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 直接操作 content layer 的 transform，完全绕过 React 渲染
  const saveViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyTransform = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (contentLayerRef.current) {
      contentLayerRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
    }
    viewRef.current = { offset, scale }
    // debounce 保存视口到 localStorage，供下次刷新恢复
    if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current)
    saveViewTimerRef.current = setTimeout(() => {
      localStorage.setItem('evo_view', JSON.stringify({ offset, scale }))
    }, 500)
  }, [])

  // 窗口 resize 时保持内容视觉中心不变
  useEffect(() => {
    let prevW = window.innerWidth
    let prevH = window.innerHeight
    const onResize = () => {
      const dw = window.innerWidth - prevW
      const dh = window.innerHeight - prevH
      prevW = window.innerWidth
      prevH = window.innerHeight
      if (dw === 0 && dh === 0) return
      const { offset, scale } = viewRef.current
      const newOffset = { x: offset.x + dw / 2, y: offset.y + dh / 2 }
      applyTransform(newOffset, scale)
      useCanvasStore.getState().setOffset(newOffset)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [applyTransform])

  // ⌘K / Ctrl+K 全局快捷键：打开搜索面板
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // 输入框有焦点时不拦截（让浏览器或输入框自己处理）
        const tag = (document.activeElement as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        setIsSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // MemoryLines 用：读取 viewRef 实时值（避免 debounce 期间的 stale store 值）
  const getViewState = useCallback(() => viewRef.current, [])

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

  // 视口裁剪（viewport culling）：仅在节点较多时启用，减少渲染数量
  // 订阅 store offset/scale 作为响应式触发，读取 viewRef 获取实时值（避免 debounce 偏差）
  const storeOffset = useCanvasStore(state => state.offset)
  const storeScale = useCanvasStore(state => state.scale)
  const [viewportNodes, viewportEdges] = useMemo(() => {
    // 节点较少时直接返回全量，避免额外开销
    if (nodes.length <= 60) return [nodes, edges]

    const { offset, scale } = viewRef.current
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    // 将屏幕视口转换为画布坐标（含 300px 缓冲，保证边缘节点可见）
    // 内容层起点在 (-vw, -vh)，故 canvasX = (screenX - offset.x + vw) / scale
    const buffer = 300 / scale
    const minX = (0 - offset.x + vw) / scale - buffer
    const maxX = (vw - offset.x + vw) / scale + buffer
    const minY = (0 - offset.y + vh) / scale - buffer
    const maxY = (vh - offset.y + vh) / scale + buffer

    const visible = nodes.filter(n =>
      n.x + 208 >= minX && n.x <= maxX &&
      n.y + 160 >= minY && n.y <= maxY
    )
    const visibleIds = new Set(visible.map(n => n.id))
    const visibleEdges = edges.filter(e => visibleIds.has(e.source) || visibleIds.has(e.target))

    return [visible, visibleEdges]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, storeOffset, storeScale])

  // Cluster Interaction — applyTransform 直操 DOM，300ms debounce 后才写 store（同滚轮缩放路径）
  const handleClusterClick = useCallback((cx: number, cy: number) => {
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const newOffset = { x: 1.5 * viewW - cx, y: 1.5 * viewH - cy }
    const newScale = 0.8
    applyTransform(newOffset, newScale)
    setScaleDisplay(newScale)
    // debounce 写 store，避免立即触发 useLodScale LOD 切换重渲染
    if (scaleDisplayRafRef.current) clearTimeout(scaleDisplayRafRef.current)
    scaleDisplayRafRef.current = window.setTimeout(() => {
      useCanvasStore.setState({ offset: newOffset, scale: newScale })
      scaleDisplayRafRef.current = null
    }, 300)
  }, [applyTransform])

  const handleClusterDrag = useCallback((cat: string, dx: number, dy: number) => {
    // 直接操作 sim 内部坐标 + DOM，不写 SQLite（拖拽结束后才持久化）
    forceSim.moveCluster(cat, dx, dy)
  }, [forceSim])

  const handleClusterDragEnd = useCallback((cat: string) => {
    forceSim.persistCluster(cat)
  }, [forceSim])

  const canvasRef = useRef<HTMLDivElement>(null)
  // isDragging 不用 state（避免 re-render），改用 ref + DOM class 控制 cursor
  const dragStart = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x: 0, y: 0 })
  const pendingOffsetRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const isTouchingRef = useRef(false)  // 双指缩放中，阻止 store 订阅回写

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'history' | 'memory' | 'evolution'>('history')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [hasNewEvolution, setHasNewEvolution] = useState(false)
  const [viewMode, setViewMode] = useState<'free' | 'timeline'>('free')
  const [showMergeBanner, setShowMergeBanner] = useState(false)
  const [isLennySpaceOpen, setIsLennySpaceOpen] = useState(false)
  const [isPGSpaceOpen, setIsPGSpaceOpen] = useState(false)
  const [isZhangSpaceOpen, setIsZhangSpaceOpen] = useState(false)
  const [isWangSpaceOpen, setIsWangSpaceOpen] = useState(false)
  const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false)
  const [openCustomSpaceId, setOpenCustomSpaceId] = useState<string | null>(null)
  const [deleteConfirmSpaceId, setDeleteConfirmSpaceId] = useState<string | null>(null)
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false)
  // 左侧 Spaces 侧边栏折叠状态（localStorage 持久化）
  const [isSpacesSidebarVisible, setIsSpacesSidebarVisible] = useState(() => {
    return localStorage.getItem('evo_spaces_sidebar_visible') !== 'false'
  })
  const [ongoingDecisions, setOngoingDecisions] = useState<OngoingDecisionItem[]>([])
  const prevNodeCountRef = useRef(0)
  const prevRulesCountRef = useRef(profileRulesCount)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const items = await listOngoingDecisionItems()
      if (!cancelled) setOngoingDecisions(items.slice(0, 4))
    }

    void load()

    const handleDecisionUpdate = () => {
      void load()
    }

    window.addEventListener(DECISION_RECORDS_UPDATED_EVENT, handleDecisionUpdate)
    return () => {
      cancelled = true
      window.removeEventListener(DECISION_RECORDS_UPDATED_EVENT, handleDecisionUpdate)
    }
  }, [])

  // 节点数量增加时做物理 kick；初始加载启动公转动画
  // （红点改为由进化基因规则数量变化触发，不再与节点数绑定）
  useEffect(() => {
    const memoryNodeCount = nodes.filter(n => n.nodeType !== 'capability').length
    if (memoryNodeCount > prevNodeCountRef.current) {
      if (prevNodeCountRef.current > 0) {
        forceSim.kick()
      } else if (memoryNodeCount > 0) {
        forceSim.startRotation()
      }
    }
    prevNodeCountRef.current = memoryNodeCount
  }, [nodes, forceSim])

  // 进化基因规则数量增加时亮红点（真实有新规则才提示）
  useEffect(() => {
    if (profileRulesCount > prevRulesCountRef.current && prevRulesCountRef.current >= 0) {
      setHasNewEvolution(true)
    }
    prevRulesCountRef.current = profileRulesCount
  }, [profileRulesCount])

  // 节点/边变化时同步到力模拟引擎
  useEffect(() => {
    forceSim.sync(nodes, edges)
  }, [nodes, edges, forceSim])

  // 智能合并横幅：节点 >8 且均为单对话节点，且未曾被关闭
  useEffect(() => {
    const dismissed = localStorage.getItem('evo_merge_banner_dismissed')
    if (dismissed) return
    const memoryNodes = nodes.filter(n => n.nodeType !== 'capability')
    const noMergesYet = memoryNodes.every(n => (n.conversationIds?.length ?? 1) === 1)
    if (memoryNodes.length > 8 && noMergesYet) setShowMergeBanner(true)
    else setShowMergeBanner(false)
  }, [nodes])

  // C3：主动对话 — 距上次对话超过 24h 时弹出 Toast 提醒
  useEffect(() => {
    if (sessionStorage.getItem('anima_proactive_shown')) return
    ;(async () => {
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        // 读取最近对话时间
        const storageRes = await fetch('/api/storage/conversations.jsonl', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!storageRes.ok) return

        const content = await storageRes.text()
        if (!content?.trim()) return

        const lines = content.trim().split('\n').filter(Boolean)
        const lastConv = JSON.parse(lines[lines.length - 1]) as { createdAt?: string }
        if (!lastConv.createdAt) return

        const elapsed = Date.now() - new Date(lastConv.createdAt).getTime()
        if (elapsed < 24 * 60 * 60 * 1000) return

        // 获取心智模型长期目标，生成提示文本
        let triggerText = t.canvas.welcomeDefault
        try {
          const mmRes = await fetch('/api/memory/mental-model', { headers })
          if (mmRes.ok) {
            const mmData = await mmRes.json() as { model?: Record<string, unknown> }
            const goals = mmData.model?.['长期目标'] as string[] | undefined
            if (goals?.[0]) {
              triggerText = t.canvas.greeting(goals[0].slice(0, 20))
            }
          }
        } catch { /* 静默 */ }

        sessionStorage.setItem('anima_proactive_shown', '1')
        toast.info(triggerText)
      } catch { /* 静默失败，不阻塞主流程 */ }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 空画布欢迎语：当天首次加载时，从心智模型生成个性化文案并缓存
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const cacheKey = 'anima_welcome_text'
    const cacheDateKey = 'anima_welcome_date'
    const cachedDate = sessionStorage.getItem(cacheDateKey)
    const cachedText = sessionStorage.getItem(cacheKey)

    if (cachedDate === today && cachedText) {
      setWelcomeText(cachedText)
      return
    }

    ;(async () => {
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        // 尝试从心智模型取长期目标
        const mmRes = await fetch('/api/memory/mental-model', { headers })
        let text = t.canvas.welcomeDefault

        if (mmRes.ok) {
          const mmData = await mmRes.json() as { model?: Record<string, unknown> }
          const goals = mmData.model?.['长期目标'] as string[] | undefined
          const recent = mmData.model?.['近期关注'] as string[] | undefined

          if (recent?.[0]) {
            text = t.canvas.welcomeRecent(recent[0].slice(0, 18))
          } else if (goals?.[0]) {
            text = t.canvas.welcomeGoal(goals[0].slice(0, 18))
          }
        }

        sessionStorage.setItem(cacheKey, text)
        sessionStorage.setItem(cacheDateKey, today)
        setWelcomeText(text)
      } catch {
        setWelcomeText(t.canvas.welcomeDefault)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // FR-004："我注意到了"通知 — 深夜/新偏好/周一三个触发场景，每类 7 天触发一次
  useEffect(() => {
    const NOTICE_COOLDOWN = 7 * 24 * 60 * 60 * 1000 // 7 天
    const now = Date.now()
    const hour = new Date().getHours()
    const dayOfWeek = new Date().getDay() // 0=周日, 1=周一

    const lastNoticeStr = sessionStorage.getItem('anima_notice_shown')
    if (lastNoticeStr && now - parseInt(lastNoticeStr) < 60 * 1000) return // 60秒内不重复

    ;(async () => {
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        // 读取对话历史，分析模式
        const storageRes = await fetch('/api/storage/conversations.jsonl', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!storageRes.ok) return

        const content = await storageRes.text()
        if (!content?.trim()) return

        const lines = content.trim().split('\n').filter(Boolean)
        const convs = lines.map(l => { try { return JSON.parse(l) as { createdAt?: string } } catch { return null } }).filter(Boolean) as { createdAt?: string }[]

        // 场景1：深夜检测（当前 22:00+ 且最近 3 次对话都在 22:00 后）
        const lateKey = 'anima_notice_late'
        const lastLate = parseInt(localStorage.getItem(lateKey) || '0')
        if (hour >= 22 && now - lastLate > NOTICE_COOLDOWN) {
          const recentLate = convs.slice(-5).filter(c => {
            const h = c.createdAt ? new Date(c.createdAt).getHours() : 0
            return h >= 22 || h < 3
          })
          if (recentLate.length >= 3) {
            localStorage.setItem(lateKey, String(now))
            sessionStorage.setItem('anima_notice_shown', String(now))
            toast.info(t.canvas.nightCare)
            return
          }
        }

        // 场景2：周一早上提醒（周一 6-11 点，且有上周的对话）
        const mondayKey = 'anima_notice_monday'
        const lastMonday = parseInt(localStorage.getItem(mondayKey) || '0')
        if (dayOfWeek === 1 && hour >= 6 && hour <= 11 && now - lastMonday > NOTICE_COOLDOWN) {
          const mmRes = await fetch('/api/memory/mental-model', { headers })
          if (mmRes.ok) {
            const mmData = await mmRes.json() as { model?: Record<string, unknown> }
            const recent = mmData.model?.['近期关注'] as string[] | undefined
            if (recent?.[0]) {
              localStorage.setItem(mondayKey, String(now))
              sessionStorage.setItem('anima_notice_shown', String(now))
              toast.info(t.canvas.mondayReminder(recent[0].slice(0, 20)))
              return
            }
          }
        }

        // 场景3：偏好更新后首次对话提醒
        const prefKey = 'anima_notice_pref'
        const lastPref = parseInt(localStorage.getItem(prefKey) || '0')
        if (now - lastPref > NOTICE_COOLDOWN) {
          const agentPrefsRes = await fetch('/api/storage/profile.json', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
          if (agentPrefsRes.ok) {
            const profContent = await agentPrefsRes.text()
            if (profContent) {
              const prof = JSON.parse(profContent) as { rules?: { preference: string; updatedAt: string }[] }
              const recentRule = (prof.rules || [])
                .filter(r => r.updatedAt && now - new Date(r.updatedAt).getTime() < 3 * 24 * 60 * 60 * 1000)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
              if (recentRule) {
                localStorage.setItem(prefKey, String(now))
                sessionStorage.setItem('anima_notice_shown', String(now))
                toast.info(`我记住了：${recentRule.preference}，今天会注意的。`)
                return
              }
            }
          }
        }
      } catch { /* 静默失败 */ }
    })()
  }, [toast]) // eslint-disable-line react-hooks/exhaustive-deps

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
        isLocalWriteRef.current = true
        setOffset(viewRef.current.offset)
        Promise.resolve().then(() => { isLocalWriteRef.current = false })
      }
    }
    animationFrameId.current = requestAnimationFrame(step)
  }, [applyTransform, setOffset])

  // 滚轮缩放 — 直接操作 DOM，每帧最多一次，完全不触发 React 重渲染
  // wheel 事件按帧合并，避免事件洪泛
  const pendingWheelDeltaRef = useRef(0)
  const lastWheelClientRef = useRef<{ clientX: number; clientY: number } | null>(null)

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
        isLocalWriteRef.current = true
        useCanvasStore.setState({ offset, scale: Math.max(0.2, Math.min(3, scale)) })
        // 微任务后清除标志，让正常外部更新（focusNode 等）可以生效
        Promise.resolve().then(() => { isLocalWriteRef.current = false })
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
      // 点击画布背景：清除话题聚焦状态
      const { focusedCategory, setFocusedCategory } = useCanvasStore.getState()
      if (focusedCategory !== null) setFocusedCategory(null)
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
      const { offset } = viewRef.current
      pendingOffsetRef.current = { ...offset }
      isDraggingRef.current = true
      // cursor 用 DOM class，不用 state（避免 re-render → flash）
      canvasRef.current?.classList.add('!cursor-grabbing')
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
      lastPos.current = { x: e.clientX, y: e.clientY }
      velocity.current = { x: 0, y: 0 }
      // 启动 RAF loop
      const loop = () => {
        applyTransform(pendingOffsetRef.current, viewRef.current.scale)
        if (isDraggingRef.current) dragRafId.current = requestAnimationFrame(loop)
        else dragRafId.current = null
      }
      dragRafId.current = requestAnimationFrame(loop)
    }
  }, [applyTransform])

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
      canvasRef.current?.classList.remove('!cursor-grabbing')
      if (Math.abs(velocity.current.x) > 2 || Math.abs(velocity.current.y) > 2) {
        startInertia()
      } else {
        isLocalWriteRef.current = true
        setOffset(viewRef.current.offset)
        Promise.resolve().then(() => { isLocalWriteRef.current = false })
      }
    }
  }, [startInertia, setOffset])

  // 处理手势缩放 (Touch)
  const touchStartDistRef = useRef<number | null>(null)
  const touchCenterRef = useRef({ x: 0, y: 0 })

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isTouchingRef.current = true
      touchStartDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      touchCenterRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current != null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const factor = dist / touchStartDistRef.current
      const prevScale = viewRef.current.scale
      const newScale = Math.max(0.2, Math.min(3, prevScale * factor))
      touchStartDistRef.current = dist

      // 以双指中心点为缩放原点（与滚轮缩放保持一致）
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800
      const centerX = touchCenterRef.current.x
      const centerY = touchCenterRef.current.y
      const centerInContentX = centerX + vw
      const centerInContentY = centerY + vh
      const scaleDiff = newScale / prevScale
      const { offset } = viewRef.current
      const newOffset = {
        x: centerInContentX - scaleDiff * (centerInContentX - offset.x),
        y: centerInContentY - scaleDiff * (centerInContentY - offset.y),
      }
      applyTransform(newOffset, newScale)
    }
  }, [applyTransform])

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false
    touchStartDistRef.current = null
    isLocalWriteRef.current = true
    setOffset(viewRef.current.offset)
    setScale(viewRef.current.scale)
    setScaleDisplay(viewRef.current.scale)
    Promise.resolve().then(() => { isLocalWriteRef.current = false })
  }, [setOffset, setScale])

  const formatDecisionDue = useCallback((date?: string) => {
    if (!date) return t.canvas.ongoingDecisionNoDate
    try {
      return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(date))
    } catch {
      return date
    }
  }, [t.canvas])

  const getDecisionStatusLabel = useCallback((status: OngoingDecisionItem['decisionRecord']['status']) => {
    switch (status) {
      case 'revisited':
        return t.canvas.ongoingDecisionStatusRevisited
      case 'adopted':
      default:
        return t.canvas.ongoingDecisionStatusActive
    }
  }, [t.canvas])

  return (
    <ForceSimContext.Provider value={forceSim}>
    <>
      {/* 工具栏 */}
      <div className="fixed top-6 right-6 z-30 flex items-center gap-3">
        {/* GitHub link */}
        <a
          href="https://github.com/fisher-byte/anima-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 text-gray-400 hover:text-gray-900 flex items-center justify-center"
          title="GitHub"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>
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
            title={t.canvas.zoomOut}
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
            title={t.canvas.resetView}
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
            title={t.canvas.zoomIn}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* 时间轴切换按钮 */}
        <button
          onClick={() => setViewMode(m => m === 'timeline' ? 'free' : 'timeline')}
          className={`p-3 backdrop-blur-md rounded-2xl shadow-sm hover:shadow-md transition-all border ${viewMode === 'timeline' ? 'bg-blue-50/90 border-blue-200 text-blue-600' : 'bg-white/90 border-gray-100 text-gray-500 hover:text-gray-900'}`}
          title={t.canvas.timeline}
        >
          <Clock className="w-5 h-5" />
        </button>

        {/* 对话历史按钮（独立） */}
        <button
          onClick={() => { setSidebarTab('history'); setIsSidebarOpen(true) }}
          className="p-3 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 text-gray-500 hover:text-gray-900"
          title={t.canvas.history}
        >
          <History className="w-5 h-5" />
        </button>

        {/* 应用菜单挂件 */}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`p-3 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 ${isMenuOpen ? 'text-blue-600 bg-blue-50/50 ring-2 ring-blue-100' : 'text-gray-500 hover:text-gray-900'}`}
            title={t.canvas.moreApps}
            data-testid="menu-btn"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-3 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 p-2 z-40 origin-top-right"
              >
                <button
                  onClick={() => { setIsSearchOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.globalSearch}</span>
                  <span className="ml-auto text-[10px] text-gray-300 font-bold border px-1 rounded">⌘K</span>
                </button>
                <button
                  onClick={() => { setSidebarTab('memory'); setIsSidebarOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.aboutMemory}</span>
                </button>
                <button
                  onClick={() => { setIsFileBrowserOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.fileLibrary}</span>
                </button>
                <button
                  onClick={() => { setSidebarTab('evolution'); setIsSidebarOpen(true); setIsMenuOpen(false); setHasNewEvolution(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <div className="relative shrink-0">
                    <BrainCircuit className="w-4 h-4" />
                    {hasNewEvolution && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <span className="font-medium whitespace-nowrap">{t.canvas.evolutionLog}</span>
                  {hasNewEvolution && (
                    <span className="ml-auto text-[10px] text-blue-500 font-bold">{t.canvas.newBadge}</span>
                  )}
                </button>
                <div className="my-1 border-t border-gray-100/50" />
                <button
                  onClick={() => { setIsSettingsOpen(true); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.preferences}</span>
                </button>
                <a
                  href="https://github.com/fisher-byte/anima-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <Github className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.githubLink}</span>
                </a>
                <div className="my-1 border-t border-gray-100/50" />
                <button
                  onClick={() => { setIsMenuOpen(false); rebuildNodeGraph() }}
                  disabled={nodeGraphRebuild.phase !== 'idle' && nodeGraphRebuild.phase !== 'done' && nodeGraphRebuild.phase !== 'error'}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-40"
                >
                  <GitMerge className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">{t.canvas.mergeNodes}</span>
                  {nodeGraphRebuild.phase === 'analyzing' && <span className="ml-auto text-xs text-gray-400">{t.canvas.analyzing}</span>}
                  {nodeGraphRebuild.phase === 'merging' && (
                    <span className="ml-auto text-xs text-gray-400">{t.canvas.mergeProgress(nodeGraphRebuild.processedClusters, nodeGraphRebuild.totalClusters)}</span>
                  )}
                  {nodeGraphRebuild.phase === 'done' && nodeGraphRebuild.totalClusters > 0 && (
                    <span className="ml-auto text-xs text-green-500">{t.canvas.merged(nodeGraphRebuild.totalClusters)}</span>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 节点数量指示 */}
      {nodes.length > 0 && (
        <div className="fixed top-4 left-4 z-30 px-3 py-1 bg-white/80 rounded-full text-xs text-gray-500 shadow-sm border border-gray-100">
          {t.canvas.nodeCount(nodes.length)}
        </div>
      )}

      {/* Spaces 侧边栏 — My Spaces + Public Spaces 合并到同一个 fixed 容器，自底向上堆叠 */}
      {/* flex-col-reverse：header（折叠按钮/pill）始终锚定在 bottom-36，空间列表向上延伸 */}
      <div className="fixed left-4 bottom-36 z-30 flex flex-col-reverse gap-1.5">
        {/* 折叠/展开切换按钮 — 在 flex-col-reverse 中渲染顺序靠前 = 视觉上在底部 */}
        <div className={`flex items-center mt-0.5 ${isSpacesSidebarVisible ? 'justify-between w-[168px]' : 'justify-start'}`}>
          {isSpacesSidebarVisible && (
            <span className="px-1 text-[10px] text-gray-400/70 font-medium tracking-widest uppercase">{t.space.mySpaces}</span>
          )}
          <div className={isSpacesSidebarVisible ? 'flex items-center gap-0.5' : ''}>
            {isSpacesSidebarVisible && customSpaces.length < 5 && (
              <button
                onClick={() => setIsCreateSpaceOpen(true)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                title={t.space.addSpace}
              >
                <PlusCircle className="w-3.5 h-3.5" />
              </button>
            )}
            {isSpacesSidebarVisible ? (
              <button
                onClick={() => {
                  setIsSpacesSidebarVisible(false)
                  localStorage.setItem('evo_spaces_sidebar_visible', 'false')
                }}
                className="p-2 text-gray-300 hover:text-gray-600 transition-colors"
                title={t.canvas.hideSpaces}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsSpacesSidebarVisible(true)
                  localStorage.setItem('evo_spaces_sidebar_visible', 'true')
                }}
                className="flex items-center gap-2 pl-3 pr-3.5 py-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all group"
                title={t.canvas.showSpaces}
              >
                <div className="flex -space-x-1.5">
                  <div className="w-5 h-5 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center text-white text-[8px] font-bold shrink-0">L</div>
                  <div className="w-5 h-5 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center text-white text-[8px] font-bold shrink-0">PG</div>
                </div>
                <span className="text-[11px] font-semibold text-gray-600 group-hover:text-gray-900 transition-colors whitespace-nowrap">{t.space.mySpaces || 'Spaces'}</span>
                <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isSpacesSidebarVisible && (
            <motion.div
              key="spaces-sidebar-content"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-1.5"
            >

        {customSpaces.map(space => {
          const COLOR_ACCENT: Record<string, string> = {
            indigo: 'bg-indigo-100 border-indigo-200/80 text-indigo-700',
            violet: 'bg-violet-100 border-violet-200/80 text-violet-700',
            emerald: 'bg-emerald-100 border-emerald-200/80 text-emerald-700',
            amber: 'bg-amber-100 border-amber-200/80 text-amber-700',
            rose: 'bg-rose-100 border-rose-200/80 text-rose-700',
            sky: 'bg-sky-100 border-sky-200/80 text-sky-700',
          }
          const avatarClass = COLOR_ACCENT[space.colorKey] ?? 'bg-gray-100 border-gray-200/80 text-gray-700'
          return (
            <div key={space.id} className="relative group/space">
              <motion.button
                onClick={() => setOpenCustomSpaceId(space.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2.5 pl-2.5 pr-3 py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer w-[168px]"
              >
                <div className={`w-7 h-7 rounded-full border flex items-center justify-center font-semibold text-[11px] shrink-0 ${avatarClass}`}>
                  {space.avatarInitials}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-gray-700 leading-tight truncate">{space.name}</div>
                  {space.topic && <div className="text-[9px] text-gray-400 leading-tight mt-0.5 truncate">{space.topic}</div>}
                </div>
                <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </motion.button>
              {/* Delete button — hover overlay */}
              <button
                onClick={e => { e.stopPropagation(); setDeleteConfirmSpaceId(space.id) }}
                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/space:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all rounded-lg"
                title={t.space.deleteSpaceTitle}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        {customSpaces.length === 0 && (
          <motion.button
            onClick={() => setIsCreateSpaceOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 pl-2.5 pr-3 py-2 bg-white/60 backdrop-blur-md rounded-2xl border border-dashed border-gray-200 hover:bg-white/90 hover:border-gray-300 transition-all cursor-pointer w-[168px] text-gray-400 hover:text-gray-600"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-medium">{t.space.addSpace}</span>
          </motion.button>
        )}

        {/* 分隔线 */}
        <div className="w-[168px] border-t border-gray-100/80 my-0.5" />

        {/* Public Spaces */}
        <div className="px-1 mb-1">
          <span className="text-[10px] text-gray-400/70 font-medium tracking-widest uppercase">{t.canvas.spacesLabel}</span>
        </div>

        {/* Lenny Rachitsky */}
        <motion.button
          onClick={() => setIsLennySpaceOpen(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer w-[196px]"
        >
          <div className="w-7 h-7 rounded-full bg-gray-900 border border-gray-700/50 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">L</div>
          <div className="text-left flex-1 min-w-0">
            <div className="pr-10 text-[11px] font-semibold text-gray-700 leading-tight whitespace-normal break-words">Lenny Rachitsky</div>
            <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{t.canvas.lennySubtitle}</div>
          </div>
          <span className="absolute right-7 top-2 inline-flex shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-700">
            {t.space.decisionModeLingSi}
          </span>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </motion.button>

        {/* Paul Graham */}
        <motion.button
          onClick={() => setIsPGSpaceOpen(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer w-[196px]"
        >
          <div className="w-7 h-7 rounded-full bg-gray-900 border border-gray-700/50 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">PG</div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-gray-700 leading-tight truncate">Paul Graham</div>
            <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{t.canvas.pgSubtitle}</div>
          </div>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </motion.button>

        {/* 张小龙 */}
        <motion.button
          onClick={() => setIsZhangSpaceOpen(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer w-[196px]"
        >
          <div className="w-7 h-7 rounded-full bg-gray-900 border border-gray-700/50 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">张</div>
          <div className="text-left flex-1 min-w-0">
            <div className="pr-10 text-[11px] font-semibold text-gray-700 leading-tight whitespace-normal break-words">张小龙</div>
            <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{t.canvas.zhangSubtitle}</div>
          </div>
          <span className="absolute right-7 top-2 inline-flex shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-700">
            {t.space.decisionModeLingSi}
          </span>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </motion.button>

        {/* 王慧文 */}
        <motion.button
          onClick={() => setIsWangSpaceOpen(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer w-[196px]"
        >
          <div className="w-7 h-7 rounded-full bg-gray-900 border border-gray-700/50 flex items-center justify-center text-white font-semibold text-[11px] shrink-0">王</div>
          <div className="text-left flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-gray-700 leading-tight truncate">王慧文</div>
            <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{t.canvas.wangSubtitle}</div>
          </div>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </motion.button>

        <div className="mt-2 w-[196px] rounded-2xl border border-gray-100 bg-white/85 px-3 py-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                {t.canvas.ongoingDecisions}
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {ongoingDecisions.length > 0
                  ? t.canvas.ongoingDecisionsCount(ongoingDecisions.length)
                  : t.canvas.ongoingDecisionsEmpty}
              </div>
            </div>
            <div className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500">
              {ongoingDecisions.length}
            </div>
          </div>

          {ongoingDecisions.length > 0 ? (
            <div className="mt-3 space-y-2">
              {ongoingDecisions.map((item) => (
                <button
                  key={item.conversation.id}
                  type="button"
                  onClick={() => openModal(item.conversation)}
                  className="w-full rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-left transition-all hover:border-gray-200 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-gray-700">{item.personaName}</div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-500">
                      {getDecisionStatusLabel(item.decisionRecord.status)}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-gray-800">
                    {item.title}
                  </div>
                  <div className="mt-1.5 text-[10px] text-gray-400">
                    {t.canvas.ongoingDecisionDue(formatDecisionDue(item.revisitAt))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-3 text-[11px] leading-5 text-gray-400">
              {t.canvas.ongoingDecisionsHint}
            </div>
          )}
        </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete Custom Space confirm dialog */}
      <AnimatePresence>
        {deleteConfirmSpaceId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
              onClick={() => setDeleteConfirmSpaceId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            >
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full mx-4 pointer-events-auto">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{t.space.deleteSpaceTitle}</h3>
                <p className="text-xs text-gray-500 mb-4">{t.space.deleteSpaceWarning}</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setDeleteConfirmSpaceId(null)}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  >{t.space.deleteCancel}</button>
                  <button
                    onClick={async () => {
                      await useCanvasStore.getState().deleteCustomSpace(deleteConfirmSpaceId)
                      setDeleteConfirmSpaceId(null)
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all"
                  >{t.space.deleteSpaceConfirm}</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          style={{ pointerEvents: isModalOpen || viewMode === 'timeline' ? 'none' : 'auto', overflow: 'hidden' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 内容层：viewMode=timeline 时隐藏（不销毁，保留 force sim 状态） */}
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
              display: viewMode === 'timeline' ? 'none' : undefined,
            }}
          >
          {/* 连线渲染 (SVG层) */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {viewportEdges.map((edge) => {
                const sourceNode = nodeMap.get(edge.source)
                const targetNode = nodeMap.get(edge.target)
                if (!sourceNode || !targetNode) return null
                return (
                  <Edge
                    key={edge.id}
                    sourceNode={sourceNode}
                    targetNode={targetNode}
                    label={edge.label}
                    edgeType={edge.edgeType}
                    weight={edge.weight}
                    relation={edge.relation}
                    reason={edge.reason}
                    confidence={edge.confidence}
                    isNew={newLogicalEdgeIds.has(edge.id)}
                  />
                )
              })}
            </svg>

            {viewportNodes.map((node) => (
              <NodeCard key={node.id} node={node} depth={nodeDepthMap.get(node.id) ?? 1} />
            ))}

            {/* Macro View Clusters */}
            {clusters.map(c => (
              <ClusterLabel
                key={c.id}
                cluster={c}
                onDrag={(dx, dy) => handleClusterDrag(c.category, dx, dy)}
                onDragEnd={() => handleClusterDragEnd(c.category)}
                onClick={() => handleClusterClick(c.x, c.y)}
              />
            ))}

            {/* empty state */}
            {nodes.length === 0 && nodesLoaded && welcomeText && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                className="text-gray-300 text-sm select-none pointer-events-none whitespace-nowrap italic"
              >
                {welcomeText}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* 时间轴视图 overlay */}
      {viewMode === 'timeline' && (
        <TimelineView
          nodes={nodes}
          openModalById={useCanvasStore.getState().openModalById}
        />
      )}

      {/* 侧边栏和搜索面板 */}
      <ConversationSidebar
        isOpen={isSidebarOpen}
        onClose={() => { setIsSidebarOpen(false); setHasNewEvolution(false) }}
        initialTab={sidebarTab}
      />
      <SearchPanel
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <LennySpaceCanvas
        isOpen={isLennySpaceOpen}
        onClose={() => setIsLennySpaceOpen(false)}
      />
      <PGSpaceCanvas
        isOpen={isPGSpaceOpen}
        onClose={() => setIsPGSpaceOpen(false)}
      />
      <ZhangSpaceCanvas
        isOpen={isZhangSpaceOpen}
        onClose={() => setIsZhangSpaceOpen(false)}
      />
      <WangSpaceCanvas
        isOpen={isWangSpaceOpen}
        onClose={() => setIsWangSpaceOpen(false)}
      />

      {/* Custom Spaces — one instance per space, rendered only when open */}
      {customSpaces.map(space => (
        <CustomSpaceCanvas
          key={space.id}
          config={space}
          isOpen={openCustomSpaceId === space.id}
          onClose={() => setOpenCustomSpaceId(null)}
        />
      ))}

      <CreateCustomSpaceModal
        isOpen={isCreateSpaceOpen}
        onClose={() => setIsCreateSpaceOpen(false)}
      />

      {/* 记忆引用连线 overlay：高亮节点 → 输入框 */}
      <AnimatePresence>
        {highlightedNodeIds.length > 0 && (
          <MemoryLines
            nodes={nodes}
            highlightedNodeIds={highlightedNodeIds}
            getViewState={getViewState}
          />
        )}
      </AnimatePresence>

      {/* 节点时间线面板 */}
      <AnimatePresence>
        {isTimelineOpen && <NodeTimelinePanel />}
      </AnimatePresence>

      {/* 智能合并横幅：历史节点 >8 且未合并过，一次性提示 */}
      <AnimatePresence>
        {showMergeBanner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-40 left-1/2 -translate-x-1/2 z-20 bg-gray-800/90 backdrop-blur-sm text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3"
          >
            <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
            <span>{t.canvas.mergeBanner(nodes.filter(n => n.nodeType !== 'capability').length)}</span>
            <button
              onClick={() => { setShowMergeBanner(false); rebuildNodeGraph() }}
              className="ml-2 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 rounded-lg text-xs font-medium"
            >{t.canvas.mergeBtn}</button>
            <button
              onClick={() => {
                setShowMergeBanner(false)
                localStorage.setItem('evo_merge_banner_dismissed', '1')
              }}
              className="text-gray-400 hover:text-white text-base leading-none"
            >×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ImportMemoryModal />

      <FileBrowserPanel
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
      />
    </>
    </ForceSimContext.Provider>
  )
}
