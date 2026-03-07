/**
 * Edge — 画布节点连线
 *
 * 极简设计原则：不打扰、不抢戏，连线只表达"有关联"，不承载额外视觉信息。
 *
 * 连线类型（edgeType）：
 *   'branch'   — 对话分支线（最淡，表达层级）
 *   'category' — 同类聚类线（比 branch 略可见）
 *   'semantic' — 语义相似线（统一极淡黑色细线，权重 → 透明度）
 *   'logical'  — 逻辑关系线（同 semantic，不再区分颜色）
 *
 * 视觉规则：
 *   - 所有连线统一黑色，仅用透明度表达强弱
 *   - LOD：scale < 0.3 时隐藏
 *   - 无 hover 标签、无点击面板（极简，不打扰）
 */
import { memo, useMemo } from 'react'
import { useLodScale } from '../hooks/useLodScale'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
  label?: string
  edgeType?: 'branch' | 'category' | 'semantic' | 'logical'
  weight?: number
  relation?: string
  reason?: string
  confidence?: number
  isNew?: boolean
}

export const Edge = memo(function Edge({
  sourceNode, targetNode, edgeType, weight, confidence
}: EdgeProps) {
  const scale = useLodScale([0.3, 0.5])
  const lodOpacity = scale < 0.3 ? 0 : scale > 0.5 ? 1 : (scale - 0.3) / 0.2

  const { path, strokeWidth, opacity } = useMemo(() => {
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

    if (edgeType === 'logical') {
      const conf = confidence ?? 0.75
      // 置信度越高越可见，但整体保持极淡
      const op = (0.06 + (conf - 0.7) / 0.3 * 0.10) * lodOpacity
      return { path: p, strokeWidth: 1, opacity: op }
    }

    if (edgeType === 'semantic') {
      const w = weight ?? 0.65
      // 权重越高越可见，最高约 0.18 opacity（极淡）
      const op = (0.05 + (w - 0.65) / 0.35 * 0.13) * lodOpacity
      return { path: p, strokeWidth: 1, opacity: op }
    }

    // branch / category
    const ratio = Math.max(0, 1 - dist / maxDist)
    const sw = 1 + ratio * 1.5
    const op = (0.04 + ratio * 0.10) * lodOpacity
    return { path: p, strokeWidth: sw, opacity: op }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, lodOpacity, edgeType, weight, confidence])

  if (lodOpacity <= 0) return null

  return (
    <g style={{ pointerEvents: 'none' }}>
      <path
        d={path}
        fill="none"
        stroke="rgba(0,0,0,1)"
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
    </g>
  )
})
