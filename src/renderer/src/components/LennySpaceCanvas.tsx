/**
 * LennySpaceCanvas — Lenny Rachitsky 沉浸式记忆画布
 *
 * 完全独立于用户个人空间的画布：
 * - 节点从 lenny-nodes.json 加载（每个用户独立），首次进入用种子数据
 * - 画布交互（平移/缩放/拖拽）完整复用 Canvas.tsx 的逻辑
 * - 对话使用 LENNY_SYSTEM_PROMPT，SSE 流式输出
 * - 对话结束后自动生成新节点并持久化到 lenny-nodes.json
 * - 不污染用户的 nodes.json / conversations.jsonl
 */
import {
  useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Square, X } from 'lucide-react'
import { Edge } from './Edge'
import { storageService, getAuthToken } from '../services/storageService'
import { LENNY_SYSTEM_PROMPT } from '@shared/constants'
import { LENNY_SEED_NODES, LENNY_SEED_EDGES } from '@shared/lennyData'
import type { Node, Edge as EdgeType } from '@shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface LennySpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

/** Extract keywords from AI response text */
function extractKeywords(text: string, count = 3): string[] {
  // Remove markdown, split into words, filter noise
  const clean = text.replace(/[#*`>\[\]()]/g, ' ').toLowerCase()
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'or',
    'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 'you', 'i', 'we', 'be', 'have', 'do',
    'not', 'but', 'from', 'by', 'as', 'if', 'can', 'will', 'when', 'how', 'what', 'your', 'their'])
  const words = clean.split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w))
  const freq: Record<string, number> = {}
  for (const w of words) freq[w] = (freq[w] || 0) + 1
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w)
}

/** Find a position that doesn't heavily overlap existing nodes */
function findOpenPosition(nodes: Node[], nearX: number, nearY: number): { x: number; y: number } {
  const minDist = 280
  for (let attempt = 0; attempt < 20; attempt++) {
    const angle = Math.random() * Math.PI * 2
    const radius = minDist + Math.random() * 200
    const cx = nearX + Math.cos(angle) * radius
    const cy = nearY + Math.sin(angle) * radius
    const tooClose = nodes.some(n => Math.hypot(n.x - cx, n.y - cy) < minDist)
    if (!tooClose) return { x: Math.round(cx), y: Math.round(cy) }
  }
  // Fallback: just offset
  return { x: Math.round(nearX + 300 + Math.random() * 200), y: Math.round(nearY + Math.random() * 200 - 100) }
}

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

  // Category color (same mapping as NodeCard)
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
        <div className="p-5 pl-6">
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
          {/* Left accent bar */}
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

export function LennySpaceCanvas({ isOpen, onClose }: LennySpaceCanvasProps) {
  // ── Canvas state ────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<EdgeType[]>([])
  const [nodesLoaded, setNodesLoaded] = useState(false)

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [contextNode, setContextNode] = useState<string | null>(null)

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

  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Load nodes/edges on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      const [nodesRaw, edgesRaw] = await Promise.all([
        storageService.read('lenny-nodes.json'),
        storageService.read('lenny-edges.json'),
      ])
      let loadedNodes: Node[] = []
      let loadedEdges: EdgeType[] = []
      try { if (nodesRaw) loadedNodes = JSON.parse(nodesRaw) } catch { /* use seed */ }
      try { if (edgesRaw) loadedEdges = JSON.parse(edgesRaw) } catch { /* use seed */ }

      if (loadedNodes.length === 0) {
        loadedNodes = LENNY_SEED_NODES
        loadedEdges = LENNY_SEED_EDGES
        // Persist seed data immediately
        await Promise.all([
          storageService.write('lenny-nodes.json', JSON.stringify(loadedNodes)),
          storageService.write('lenny-edges.json', JSON.stringify(loadedEdges)),
        ])
      }
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setNodesLoaded(true)
    })()
  }, [isOpen])

  // ── Reset chat when closed ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort()
      setMessages([])
      setContextNode(null)
      setInput('')
      setIsStreaming(false)
    }
  }, [isOpen])

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Focus input on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 400)
  }, [isOpen])

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
    // Center on the middle of all nodes
    const vw = window.innerWidth
    const vh = window.innerHeight
    const initScale = 0.7
    // Content layer is 300vw x 300vh, origin top-left at (-vw, -vh)
    // We want canvas center (1920, 1200) to appear at screen center (vw/2, vh/2)
    // screen_x = node.x * scale + offset.x - vw  =>  vw/2 = 1920*0.7 + ox - vw
    // ox = vw/2 - 1920*0.7 + vw = 1.5vw - 1344
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
      storageService.write('lenny-nodes.json', JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [])

  // ── Node context select ─────────────────────────────────────────────────────
  const handleContextSelect = useCallback((title: string) => {
    setContextNode(title)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // ── SSE chat ────────────────────────────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m))
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    setInput('')

    const fullText = contextNode ? `[关于"${contextNode}"] ${trimmed}` : trimmed
    setContextNode(null)

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: fullText }
    const asstId = `a-${Date.now()}`
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '', isStreaming: true }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setIsStreaming(true)

    const history = [...messages, userMsg].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    let finalContent = ''

    try {
      const res = await authFetch('/api/ai/stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: history,
          preferences: [],
          systemPromptOverride: LENNY_SYSTEM_PROMPT,
        }),
        signal,
      })

      if (!res.ok) {
        const errText = res.status === 400
          ? 'API Key 未配置，请在设置中填写 API Key'
          : `请求失败（${res.status}）`
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: errText, isStreaming: false } : m))
        setIsStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let fullContent = ''

      while (true) {
        if (signal.aborted) break
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() ?? ''
        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          try {
            const parsed = JSON.parse(dataLine.slice(6))
            if (parsed.type === 'content' && parsed.content) {
              fullContent += parsed.content
              const captured = fullContent
              setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: captured } : m))
            } else if (parsed.type === 'done') {
              fullContent = parsed.fullText ?? fullContent
              setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: fullContent, isStreaming: false } : m))
            }
          } catch { /* skip malformed SSE */ }
        }
      }
      finalContent = fullContent
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const errMsg = err instanceof Error ? err.message : '连接出错，请重试'
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: errMsg, isStreaming: false } : m))
      } else {
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, isStreaming: false } : m))
      }
    } finally {
      setIsStreaming(false)
    }

    // ── Generate new node from conversation ──────────────────────────────────
    if (finalContent && !signal.aborted) {
      const nodeTitle = fullText.replace(/^\[关于"[^"]+"\]\s*/, '').slice(0, 30) || 'Lenny 对话'
      const keywords = extractKeywords(finalContent, 3)

      // Pick a category based on keywords (simple heuristic)
      let category = '工作事业'
      const lower = finalContent.toLowerCase()
      if (/relationship|team|culture|management|feedback/.test(lower)) category = '关系情感'
      else if (/think|philosophy|framework|belief|mindset/.test(lower)) category = '思考世界'
      else if (/health|workout|sleep|energy|wellness/.test(lower)) category = '健康身体'
      else if (/design|creative|writing|art|music/.test(lower)) category = '创意表达'

      // Find an open position near the center
      const centerX = nodes.length > 0 ? nodes.reduce((s, n) => s + n.x, 0) / nodes.length : 1920
      const centerY = nodes.length > 0 ? nodes.reduce((s, n) => s + n.y, 0) / nodes.length : 1200
      const { x, y } = findOpenPosition(nodes, centerX, centerY)

      const newNode: Node = {
        id: `lenny-conv-${Date.now()}`,
        title: nodeTitle,
        keywords,
        date: new Date().toISOString().split('T')[0],
        conversationId: `lenny-conv-${Date.now()}`,
        category,
        nodeType: 'memory',
        x,
        y,
      }

      setNodes(prev => {
        const updated = [...prev, newNode]
        storageService.write('lenny-nodes.json', JSON.stringify(updated)).catch(() => {})
        return updated
      })

      // Persist conversation
      const conv = {
        id: `lenny-conv-${Date.now()}`,
        createdAt: new Date().toISOString(),
        userMessage: fullText,
        assistantMessage: finalContent,
      }
      storageService.append('lenny-conversations.jsonl', JSON.stringify(conv) + '\n').catch(() => {})
    }
  }, [messages, isStreaming, contextNode, nodes])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }, [input, sendMessage])

  // ── Node/Edge map for rendering ─────────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>()
    nodes.forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  // ── Chat panel height estimate ──────────────────────────────────────────────
  const chatPanelHeight = messages.length > 0 ? 200 : 0
  const inputAreaHeight = 80

  // ─────────────────────────────────────────────────────────────────────────────

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

        {/* Scale indicator */}
        <div className="text-[11px] font-bold text-gray-300" style={{ minWidth: 40, textAlign: 'right' }}>
          {Math.round(scaleDisplay * 100)}%
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        className="absolute inset-0 overflow-hidden lenny-dot-grid cursor-grab"
        style={{ top: 56, bottom: chatPanelHeight + inputAreaHeight }}
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Content layer: 300vw × 300vh, positioned at (-vw, -vh) */}
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

        {/* Empty state */}
        {nodesLoaded && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm italic" style={{ color: 'rgba(255,255,255,0.2)' }}>Loading Lenny's knowledge...</p>
          </div>
        )}
      </div>

      {/* ── Chat messages (last 4) ── */}
      <AnimatePresence>
        {messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed left-0 right-0 z-[70] overflow-y-auto px-4 py-2 space-y-2"
            style={{
              bottom: inputAreaHeight,
              maxHeight: chatPanelHeight,
              backgroundColor: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            {messages.slice(-4).map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-2xl mx-auto`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0 mt-0.5">
                    L
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user' ? 'text-gray-700' : 'text-gray-600'
                  }`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'rgba(0,0,0,0.06)' : 'rgba(251,191,36,0.1)',
                    borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  }}
                >
                  {msg.content || (msg.isStreaming ? '▋' : '')}
                  {msg.isStreaming && msg.content && (
                    <span className="inline-block w-0.5 h-3 bg-amber-500 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input area ── */}
      <div
        className="fixed left-0 right-0 z-[70] px-4 py-3"
        style={{
          bottom: 0,
          height: inputAreaHeight,
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div className="max-w-2xl mx-auto">
          {/* Context chip */}
          <AnimatePresence>
            {contextNode && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="flex items-center gap-1.5 mb-1.5"
              >
                <span className="text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200">
                  {contextNode.slice(0, 40)}{contextNode.length > 40 ? '…' : ''}
                  <button onClick={() => setContextNode(null)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5 bg-white border border-gray-100 shadow-sm focus-within:border-gray-200 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Lenny anything about product, growth, or career…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-sm resize-none outline-none leading-relaxed text-gray-800 placeholder-gray-400"
              style={{ maxHeight: 80, overflow: 'auto', fieldSizing: 'content' } as React.CSSProperties}
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-500 flex items-center justify-center transition-colors shrink-0"
                title="停止生成"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-100 disabled:text-gray-300 text-white"
                title="发送"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dot grid style - light theme matching personal canvas */}
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
