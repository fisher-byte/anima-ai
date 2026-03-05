import { memo, useMemo, useState } from 'react'
import { useLodScale } from '../hooks/useLodScale'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
  label?: string
}

export const Edge = memo(function Edge({ sourceNode, targetNode, label }: EdgeProps) {
  // 只在 LOD 阈值跨越时触发重渲染，zoom 中不重渲染
  const scale = useLodScale([0.3, 0.5])
  const lodOpacity = scale < 0.3 ? 0 : scale > 0.5 ? 1 : (scale - 0.3) / 0.2
  const [hovered, setHovered] = useState(false)

  const { path, midX, midY, strokeWidth, opacity, color } = useMemo(() => {
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60

    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.hypot(dx, dy)
    const ctrlOffset = Math.min(Math.abs(dx) * 0.5, 150)

    const p = `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`

    // 曲线中点近似（贝塞尔 t=0.5）
    const cx1 = sx + ctrlOffset
    const cy1 = sy
    const cx2 = tx - ctrlOffset
    const cy2 = ty
    const mx = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx
    const my = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty

    const maxDist = 1000
    const ratio = Math.max(0, 1 - dist / maxDist)
    const sw = 1.5 + ratio * 2
    const op = (0.05 + ratio * 0.15) * lodOpacity

    const nodeColor = sourceNode.color || 'rgba(148, 163, 184, 0.9)'

    return { path: p, midX: mx, midY: my, strokeWidth: sw, opacity: op, color: nodeColor }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, sourceNode.color, lodOpacity])

  if (lodOpacity <= 0) return null

  return (
    <g>
      {/* 可见连线 */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={hovered ? Math.min(opacity * 3, 0.6) : opacity}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      {/* 透明宽 hitbox 用于接收 hover 事件 */}
      {label && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          style={{ cursor: 'default' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      {/* Hover 标签 */}
      {label && hovered && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect
            x={-22}
            y={-11}
            width={44}
            height={20}
            rx={6}
            fill="rgba(15,15,15,0.75)"
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fill="white"
            fontSize={10}
            fontWeight={500}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  )
})
