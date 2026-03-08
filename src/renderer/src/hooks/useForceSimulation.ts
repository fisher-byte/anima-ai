/**
 * useForceSimulation — 节点物理力模拟
 *
 * 两层力系统：
 *   Layer 1 (节点级)：同类引力、异类斥力、连线弹簧、全局中心引力
 *   Layer 2 (星云级)：星云间斥力、连线引导靠近
 *   全局旋转：所有节点围绕全体几何重心缓慢公转
 *
 * 性能策略（核心原则）：
 *   - force sim 只写 DOM（el.style.left/top），永远不写 Zustand store
 *   - 写 store 会触发 React 重渲染，导致 motion.div 读取 store 坐标覆盖 DOM，产生闪回
 *   - 持久化仅在：拖拽结束 / 星云拖拽结束 / 页面卸载 时触发（低频）
 *   - 星云间 hasEdge 检查用 Set 预计算，避免 O(n²) 的 Array.some
 */
import { useRef, useEffect, useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node, Edge } from '@shared/types'

// ── 力参数常量 ──────────────────────────────────────────────────────────────

const NODE_REPEL          = 8000    // 节点间全局斥力强度
const NODE_REPEL_MAX_DIST = 500     // 斥力生效最大距离（节点卡片 ~208x160，需要更大间距避免重叠）
const SAME_ATTRACT        = 0.0018  // 同类弹簧系数
const SAME_IDEAL_DIST     = 280     // 同类理想间距（大于卡片对角线，避免重叠）
const SAME_MAX_DIST       = 700     // 同类引力生效上限
const DIFF_REPEL          = 120     // 异类斥力系数
const DIFF_MAX_DIST       = 500     // 异类斥力生效上限
const EDGE_SPRING         = 0.0025  // 连线弹簧系数
const EDGE_IDEAL_LEN      = 300     // 连线理想长度
const CENTER_GRAVITY      = 0.00008 // 全局中心引力（防止节点飘出）
const DAMPING             = 0.82    // 速度阻尼
const MAX_VELOCITY        = 2.5     // 速度上限

const CLUSTER_REPEL          = 12000  // 星云间斥力
const CLUSTER_REPEL_MAX_DIST = 1200   // 星云斥力生效上限
const CLUSTER_EDGE_ATTRACT   = 0.0008 // 星云间连线引力

/** 全局公转切向力系数 —— 所有节点围绕几何重心缓慢公转 */
const GLOBAL_ROTATION_TORQUE = 0.00012

const TEMPERATURE_INIT  = 0      // 初始温度为 0：冷启动完全冻结布局力，仅保留公转
const TEMPERATURE_KICK  = 0.6    // kick 后温度
const TEMPERATURE_MIN   = 0.15   // kick 后最低运行温度（保持微动但布局力仍有效）
const COOLING_RATE      = 0.997  // 每帧冷却系数

// ── 内部数据结构 ──────────────────────────────────────────────────────────────

interface SimNode {
  id: string
  x: number
  y: number
  category: string
  vx: number
  vy: number
  fx: number
  fy: number
  isCapability: boolean
}

interface SimCluster {
  id: string
  nodeIds: string[]
  cx: number
  cy: number
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ForceSimulationAPI {
  sync: (nodes: Node[], edges: Edge[]) => void
  kick: () => void
  /** 仅启动公转动画，不提升布局力温度（用于刷新恢复场景，保持节点原位） */
  startRotation: () => void
  setDragging: (nodeId: string | null) => void
  /** 将指定节点的坐标同步到 sim 内部（拖拽/推挤结束时调用，防止 sim tick 把节点推回旧位置） */
  updateSimNode: (nodeId: string, x: number, y: number) => void
  moveCluster: (category: string, dx: number, dy: number) => void
  persistCluster: (category: string) => void
  /** 将 sim 内部坐标全量写回 store（不走 SQLite，仅内存） */
  flushToStore: () => void
}

export function useForceSimulation(): ForceSimulationAPI {
  // 只用 getState() 取函数引用，不订阅 store，不触发重渲染
  const updateNodePositionInMemory = useCanvasStore.getState().updateNodePositionInMemory
  const updateNodePosition = useCanvasStore.getState().updateNodePosition

  const nodesRef    = useRef<SimNode[]>([])
  const nodeMapRef  = useRef<Map<string, SimNode>>(new Map())
  const edgesRef    = useRef<Edge[]>([])
  const clustersRef = useRef<SimCluster[]>([])
  const temperatureRef    = useRef(TEMPERATURE_INIT)
  const hasKickedRef      = useRef(false)  // 是否曾被 kick 过；冷启动前温度保持 0
  const rafRef            = useRef<number | null>(null)
  const draggedNodeIdRef  = useRef<string | null>(null)
  const frameCountRef     = useRef(0)

  // ── 计算星云中心 ──────────────────────────────────────────────────────────
  const recomputeClusters = () => {
    const accum = new Map<string, { x: number; y: number; count: number; ids: string[] }>()
    for (const n of nodesRef.current) {
      if (n.isCapability) continue
      let e = accum.get(n.category)
      if (!e) { e = { x: 0, y: 0, count: 0, ids: [] }; accum.set(n.category, e) }
      e.x += n.x; e.y += n.y; e.count++; e.ids.push(n.id)
    }
    clustersRef.current = Array.from(accum.entries()).map(([id, v]) => ({
      id, nodeIds: v.ids, cx: v.x / v.count, cy: v.y / v.count,
    }))
  }

  // ── 核心模拟 tick ─────────────────────────────────────────────────────────
  const tickRef = useRef<() => void>()

  tickRef.current = () => {
    const nodes  = nodesRef.current
    const edges  = edgesRef.current
    const temp   = temperatureRef.current
    const dragId = draggedNodeIdRef.current

    if (nodes.length === 0) {
      rafRef.current = requestAnimationFrame(tickRef.current!)
      return
    }

    // 1. 重置力 & 更新星云中心
    for (const n of nodes) { n.fx = 0; n.fy = 0 }
    recomputeClusters()
    const clusters   = clustersRef.current

    // 全局几何重心（用于公转切向力）
    let gcx = 0, gcy = 0, gcCount = 0
    for (const n of nodes) {
      if (n.isCapability) continue
      gcx += n.x; gcy += n.y; gcCount++
    }
    if (gcCount > 0) { gcx /= gcCount; gcy /= gcCount }

    // 预计算星云间连线关系（O(edges) 预处理，避免 tick 内 O(n²) 查找）
    const clusterEdgeSet = new Set<string>()
    for (const edge of edges) {
      const a = nodeMapRef.current.get(edge.source)
      const b = nodeMapRef.current.get(edge.target)
      if (!a || !b || a.category === b.category) continue
      const key = [a.category, b.category].sort().join('|||')
      clusterEdgeSet.add(key)
    }

    // 2. 节点级力计算
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a.isCapability || a.id === dragId) continue

      // 全局中心引力
      a.fx -= a.x * CENTER_GRAVITY
      a.fy -= a.y * CENTER_GRAVITY

      // 公转切向力现在在速度积分阶段直接加到位移上（不受温度衰减），此处不再重复

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const b = nodes[j]
        if (b.isCapability) continue

        const dx   = b.x - a.x
        const dy   = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1

        // 节点斥力
        if (dist < NODE_REPEL_MAX_DIST) {
          const repel = NODE_REPEL / (dist * dist)
          a.fx -= (dx / dist) * repel
          a.fy -= (dy / dist) * repel
        }

        if (a.category === b.category) {
          // 同类引力弹簧
          if (dist < SAME_MAX_DIST) {
            const spring = (dist - SAME_IDEAL_DIST) * SAME_ATTRACT
            a.fx += (dx / dist) * spring
            a.fy += (dy / dist) * spring
          }
        } else {
          // 异类斥力
          if (dist < DIFF_MAX_DIST) {
            const repel = DIFF_REPEL / dist
            a.fx -= (dx / dist) * repel
            a.fy -= (dy / dist) * repel
          }
        }
      }
    }

    // 3. 连线弹簧力
    for (const edge of edges) {
      const a = nodeMapRef.current.get(edge.source)
      const b = nodeMapRef.current.get(edge.target)
      if (!a || !b || a.isCapability || b.isCapability) continue
      const dx     = b.x - a.x
      const dy     = b.y - a.y
      const dist   = Math.hypot(dx, dy) || 1
      const spring = (dist - EDGE_IDEAL_LEN) * EDGE_SPRING
      const nx = dx / dist; const ny = dy / dist
      if (a.id !== dragId) { a.fx += nx * spring; a.fy += ny * spring }
      if (b.id !== dragId) { b.fx -= nx * spring; b.fy -= ny * spring }
    }

    // 4. 星云间斥力 & 连线引力
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const c1   = clusters[i]; const c2 = clusters[j]
        const dx   = c2.cx - c1.cx; const dy = c2.cy - c1.cy
        const dist = Math.hypot(dx, dy) || 1

        if (dist < CLUSTER_REPEL_MAX_DIST) {
          const repel = CLUSTER_REPEL / (dist * dist)
          const nx = dx / dist; const ny = dy / dist
          const s1 = 0.5 / Math.max(1, c1.nodeIds.length)
          const s2 = 0.5 / Math.max(1, c2.nodeIds.length)
          for (const id of c1.nodeIds) {
            const n = nodeMapRef.current.get(id)
            if (n && n.id !== dragId) { n.fx -= nx * repel * s1; n.fy -= ny * repel * s1 }
          }
          for (const id of c2.nodeIds) {
            const n = nodeMapRef.current.get(id)
            if (n && n.id !== dragId) { n.fx += nx * repel * s2; n.fy += ny * repel * s2 }
          }
        }

        const edgeKey = [c1.id, c2.id].sort().join('|||')
        if (clusterEdgeSet.has(edgeKey) && dist > 800) {
          const attract = (dist - 800) * CLUSTER_EDGE_ATTRACT
          const nx = dx / dist; const ny = dy / dist
          const s1 = 1 / Math.max(1, c1.nodeIds.length)
          const s2 = 1 / Math.max(1, c2.nodeIds.length)
          for (const id of c1.nodeIds) {
            const n = nodeMapRef.current.get(id)
            if (n && n.id !== dragId) { n.fx += nx * attract * s1; n.fy += ny * attract * s1 }
          }
          for (const id of c2.nodeIds) {
            const n = nodeMapRef.current.get(id)
            if (n && n.id !== dragId) { n.fx -= nx * attract * s2; n.fy -= ny * attract * s2 }
          }
        }
      }
    }

    // 5. 速度积分
    for (const n of nodes) {
      if (n.isCapability || n.id === dragId) continue
      if (temp > 0) {
        // 布局力受温度衰减
        n.vx = (n.vx + n.fx) * DAMPING
        n.vy = (n.vy + n.fy) * DAMPING
        const speed = Math.hypot(n.vx, n.vy)
        if (speed > MAX_VELOCITY) { n.vx = (n.vx / speed) * MAX_VELOCITY; n.vy = (n.vy / speed) * MAX_VELOCITY }
      } else {
        // 温度为 0 时不积累速度（防止 kick 后爆发）
        n.vx = 0; n.vy = 0
      }
      // 公转切向力仅在 kick 后（hasKickedRef.current）才生效，冷启动阶段完全冻结
      if (hasKickedRef.current) {
        const rx = n.x - gcx
        const ry = n.y - gcy
        // 顺时针公转：(+ry, -rx) 方向
        const rotDx =  ry * GLOBAL_ROTATION_TORQUE
        const rotDy = -rx * GLOBAL_ROTATION_TORQUE
        n.x += n.vx * temp + rotDx
        n.y += n.vy * temp + rotDy
      } else {
        n.x += n.vx * temp
        n.y += n.vy * temp
      }
    }

    // 6. DOM 直写（只写 DOM，绝不写 store）
    for (const n of nodes) {
      if (n.id === dragId) continue
      const el = document.getElementById(`node-${n.id}`)
      if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px` }
    }

    // 6b. 星云标签也直接写 DOM（避免等待 store sync 导致标签卡顿）
    for (const c of clusters) {
      const labelEl = document.getElementById(`cluster-label-${c.id}`)
      if (labelEl) { labelEl.style.left = `${c.cx}px`; labelEl.style.top = `${c.cy}px` }
    }

    // 7. 低频 store 同步（让 Edge SVG 和 ClusterLabel 跟上 DOM 坐标）
    //    每 90 帧（约 1.5fps）同步一次，避免 React 重渲染干扰动画
    frameCountRef.current++
    if (frameCountRef.current % 90 === 0 && !dragId) {
      const updateFn = useCanvasStore.getState().updateNodePositionInMemory
      for (const n of nodes) {
        if (!n.isCapability) updateFn(n.id, n.x, n.y)
      }
    }

    // 8. 温度冷却（未 kick 过时保持 0，kick 后降至 TEMPERATURE_MIN 后维持微动）
    if (hasKickedRef.current) {
      temperatureRef.current = Math.max(TEMPERATURE_MIN, temperatureRef.current * COOLING_RATE)
    }

    rafRef.current = requestAnimationFrame(tickRef.current!)
  }

  // ── 启动模拟 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => tickRef.current!()
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // ── 对外 API ──────────────────────────────────────────────────────────────

  const sync = useCallback((storeNodes: Node[], edges: Edge[]) => {
    const prevMap = nodeMapRef.current
    const newNodes: SimNode[] = storeNodes.map(n => {
      const prev = prevMap.get(n.id)
      return {
        id: n.id,
        x: prev ? prev.x : n.x,
        y: prev ? prev.y : n.y,
        category: n.category || '其他',
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        fx: 0, fy: 0,
        isCapability: n.nodeType === 'capability',
      }
    })
    nodesRef.current  = newNodes
    nodeMapRef.current = new Map(newNodes.map(n => [n.id, n]))
    edgesRef.current  = edges
  }, [])

  const kick = useCallback(() => {
    hasKickedRef.current = true
    temperatureRef.current = Math.max(temperatureRef.current, TEMPERATURE_KICK)
  }, [])

  const startRotation = useCallback(() => {
    // 仅激活公转，不提升温度——节点保持原位，只启动缓慢公转动画
    hasKickedRef.current = true
  }, [])

  const setDragging = useCallback((nodeId: string | null) => {
    draggedNodeIdRef.current = nodeId
  }, [])

  const updateSimNode = useCallback((nodeId: string, x: number, y: number) => {
    const n = nodeMapRef.current.get(nodeId)
    if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0 }
  }, [])

  const moveCluster = useCallback((category: string, dx: number, dy: number) => {
    for (const n of nodesRef.current) {
      if (n.category !== category) continue
      n.x += dx; n.y += dy
      const el = document.getElementById(`node-${n.id}`)
      if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px` }
    }
  }, [])

  const persistCluster = useCallback((category: string) => {
    // 批量收集需要更新的坐标
    const updates: { id: string; x: number; y: number }[] = []
    for (const n of nodesRef.current) {
      if (n.category !== category) continue
      updates.push({ id: n.id, x: n.x, y: n.y })
    }
    if (updates.length === 0) return
    // 逐个写 store + SQLite（updateNodePosition 是现有的批量安全方法）
    for (const u of updates) {
      updateNodePosition(u.id, u.x, u.y)
    }
    kick()
  }, [updateNodePosition, kick])

  const flushToStore = useCallback(() => {
    for (const n of nodesRef.current) {
      updateNodePositionInMemory(n.id, n.x, n.y)
    }
  }, [updateNodePositionInMemory])

  return { sync, kick, startRotation, setDragging, updateSimNode, moveCluster, persistCluster, flushToStore }
}
