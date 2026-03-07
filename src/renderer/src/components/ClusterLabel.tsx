import { useRef, useCallback } from 'react'
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

  // 拖拽：全手动 pointer 事件，不依赖 Framer Motion drag（避免 spring 主线程动画）
  const isDraggingRef = useRef(false)
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
    onDrag(dx / inverseScale, dy / inverseScale)
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
      className="absolute flex items-center justify-center w-[400px] h-[200px] -translate-x-1/2 -translate-y-1/2 select-none"
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
