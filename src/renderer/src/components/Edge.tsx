import { memo, useMemo } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
}

export const Edge = memo(function Edge({ sourceNode, targetNode }: EdgeProps) {
  const scale = useCanvasStore(state => state.scale)
  const lodOpacity = scale < 0.3 ? 0 : scale > 0.5 ? 1 : (scale - 0.3) / 0.2

  const { path, strokeWidth, opacity, color } = useMemo(() => {
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60

    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.hypot(dx, dy)
    const ctrlOffset = Math.min(Math.abs(dx) * 0.5, 150)

    const p = `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`

    const maxDist = 1000
    const ratio = Math.max(0, 1 - dist / maxDist)
    const sw = 1.5 + ratio * 2
    const op = (0.05 + ratio * 0.15) * lodOpacity

    const nodeColor = sourceNode.color || 'rgba(148, 163, 184, 0.9)'

    return { path: p, strokeWidth: sw, opacity: op, color: nodeColor }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, sourceNode.color, lodOpacity])

  if (lodOpacity <= 0) return null

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeOpacity={opacity}
      strokeLinecap="round"
      style={{ pointerEvents: 'none' }}
    />
  )
})
