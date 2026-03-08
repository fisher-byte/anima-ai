import { useRef, useCallback, useLayoutEffect } from 'react'
import { Layers } from 'lucide-react'
import { useLodScale } from '../hooks/useLodScale'

interface Cluster {
  id: string
  category: string
  x: number
  y: number
  color: string
  count: number
}

interface ClusterLabelProps {
  cluster: Cluster
  onDrag: (dx: number, dy: number) => void
  onDragEnd?: () => void
  onClick: () => void
}

export function ClusterLabel({ cluster, onDrag, onDragEnd, onClick }: ClusterLabelProps) {
  const scale = useLodScale([0.4, 0.6])

  // 在 0.4~0.6 之间淡出，< 0.4 完全可见，> 0.6 完全不可见
  const opacity = scale > 0.6 ? 0 : scale < 0.4 ? 1 : 1 - (scale - 0.4) / 0.2
  const isVisible = opacity > 0

  // 反向缩放：保持标签在缩小时可读
  const inverseScale = Math.max(1, (1 / Math.max(scale, 0.1)) * 0.6)

  // 自持位置：拖拽时直接写 DOM，不依赖 prop 更新（避免需要 re-render 才能移动）
  const divRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: cluster.x, y: cluster.y })
  const isDraggingRef = useRef(false)

  // 非拖拽时跟随 prop（force sim / store 更新）
  useLayoutEffect(() => {
    if (isDraggingRef.current) return
    posRef.current = { x: cluster.x, y: cluster.y }
    if (divRef.current) {
      divRef.current.style.left = `${cluster.x}px`
      divRef.current.style.top  = `${cluster.y}px`
    }
  }, [cluster.x, cluster.y])

  const lastPosRef = useRef({ x: 0, y: 0 })
  const didDragRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isVisible) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    isDraggingRef.current = true
    didDragRef.current = false
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }, [isVisible])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    // delta 需要除以 inverseScale，因为标签本身被放大了
    const contentDx = dx / inverseScale
    const contentDy = dy / inverseScale
    // 直接移动自身 DOM（流畅跟手）
    posRef.current = { x: posRef.current.x + contentDx, y: posRef.current.y + contentDy }
    if (divRef.current) {
      divRef.current.style.left = `${posRef.current.x}px`
      divRef.current.style.top  = `${posRef.current.y}px`
    }
    // 同步通知父组件移动节点
    onDrag(contentDx, contentDy)
  }, [onDrag, inverseScale])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (didDragRef.current) {
      onDragEnd?.()  // 拖拽结束，持久化节点位置
    } else {
      onClick()  // 没拖动才算点击
    }
  }, [onClick, onDragEnd])

  return (
    <div
      ref={divRef}
      className="absolute flex items-center justify-center w-[400px] h-[200px] select-none"
      style={{
        left: cluster.x,
        top: cluster.y,
        opacity,
        transform: `translate(-50%, -50%) scale(${opacity === 0 ? 0.5 : inverseScale})`,
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: isVisible ? 'auto' : 'none',
        cursor: 'grab',
        zIndex: 20,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="relative flex flex-col items-center group">
        <h1
          className="relative text-5xl font-black tracking-tighter text-gray-800 mb-2 drop-shadow-sm group-hover:scale-105 transition-transform select-none"
          style={{ textShadow: '0 2px 10px rgba(255,255,255,0.9)' }}
        >
          {cluster.category === '__capability__' ? '能力' : cluster.category}
        </h1>
        <div className="relative flex items-center gap-2 text-sm font-medium text-gray-600 uppercase tracking-widest bg-white/60 px-3 py-1 rounded-full backdrop-blur-sm border border-gray-200/60 select-none">
          <Layers className="w-3 h-3" />
          <span>{cluster.count} 条记忆</span>
        </div>
      </div>
    </div>
  )
}
