import { memo, useMemo, useState, useCallback } from 'react'
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
}

/** 逻辑关系的视觉样式 */
const RELATION_STYLES: Record<string, { color: string; dash: string; label: string }> = {
  '深化了':      { color: 'rgba(59, 130, 246, 0.9)',  dash: 'none',  label: '深化' },
  '解决了':      { color: 'rgba(34, 197, 94, 0.9)',   dash: 'none',  label: '解决' },
  '矛盾于':      { color: 'rgba(239, 68, 68, 0.9)',   dash: '6 3',   label: '矛盾' },
  '依赖于':      { color: 'rgba(107, 114, 128, 0.9)', dash: 'none',  label: '依赖' },
  '启发了':      { color: 'rgba(234, 179, 8, 0.9)',   dash: '4 4',   label: '启发' },
  '重新思考了':  { color: 'rgba(249, 115, 22, 0.9)',  dash: '8 3 2 3', label: '重思' },
}

const DEFAULT_RELATION_STYLE = { color: 'rgba(139, 92, 246, 0.9)', dash: '4 4', label: '关联' }

export const Edge = memo(function Edge({
  sourceNode, targetNode, label, edgeType, weight, relation, reason, confidence
}: EdgeProps) {
  const scale = useLodScale([0.3, 0.5])
  const lodOpacity = scale < 0.3 ? 0 : scale > 0.5 ? 1 : (scale - 0.3) / 0.2
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)

  const handleClick = useCallback((e: React.MouseEvent) => {
    // 只有语义边或逻辑边才有解释面板
    if (edgeType !== 'semantic' && edgeType !== 'logical') return
    e.stopPropagation()
    setClicked(v => !v)
  }, [edgeType])

  const { path, midX, midY, strokeWidth, opacity, color, dashArray } = useMemo(() => {
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60

    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.hypot(dx, dy)
    const ctrlOffset = Math.min(Math.abs(dx) * 0.5, 150)

    const p = `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`

    const cx1 = sx + ctrlOffset, cy1 = sy
    const cx2 = tx - ctrlOffset, cy2 = ty
    const mx = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx
    const my = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty

    const maxDist = 1000

    if (edgeType === 'logical' && relation) {
      const style = RELATION_STYLES[relation] ?? DEFAULT_RELATION_STYLE
      const conf = confidence ?? 0.75
      const sw = 1.2 + (conf - 0.7) / 0.3 * 1.8   // 0.7→1.2px, 1.0→3.0px
      const op = (0.25 + (conf - 0.7) / 0.3 * 0.35) * lodOpacity  // 0.7→0.25, 1.0→0.6
      return {
        path: p, midX: mx, midY: my,
        strokeWidth: sw, opacity: op,
        color: style.color,
        dashArray: style.dash === 'none' ? undefined : style.dash
      }
    }

    if (edgeType === 'semantic') {
      const w = weight ?? 0.65
      const sw = 1 + (w - 0.65) / 0.35 * 2.5
      const op = (0.1 + (w - 0.65) / 0.35 * 0.3) * lodOpacity
      return {
        path: p, midX: mx, midY: my,
        strokeWidth: sw, opacity: op,
        color: 'rgba(139, 92, 246, 0.9)',
        dashArray: '4 4'
      }
    }

    const ratio = Math.max(0, 1 - dist / maxDist)
    const sw = 1.5 + ratio * 2
    const op = (0.05 + ratio * 0.15) * lodOpacity
    const nodeColor = sourceNode.color || 'rgba(148, 163, 184, 0.9)'
    return { path: p, midX: mx, midY: my, strokeWidth: sw, opacity: op, color: nodeColor, dashArray: undefined, arrowId: undefined }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, sourceNode.color, lodOpacity, edgeType, weight, relation, confidence])

  if (lodOpacity <= 0) return null

  const isInteractive = edgeType === 'semantic' || edgeType === 'logical'
  const displayLabel = edgeType === 'logical' && relation
    ? (RELATION_STYLES[relation]?.label ?? label ?? relation)
    : label

  // 解释面板文字
  const panelTitle = edgeType === 'logical' ? `${relation}` : '语义相似'
  const panelScore = edgeType === 'logical'
    ? `置信度 ${((confidence ?? 0.75) * 100).toFixed(0)}%`
    : `相似度 ${((weight ?? 0.65) * 100).toFixed(0)}%`
  const panelReason = reason || (
    edgeType === 'semantic'
      ? (weight ?? 0) >= 0.85 ? '两次对话高度相关' : (weight ?? 0) >= 0.75 ? '话题有明显重叠' : '话题存在关联'
      : ''
  )

  // 面板宽度自适应文字长度
  const panelW = Math.max(160, Math.min(240, panelReason.length * 12 + 32))
  const panelH = panelReason ? 72 : 44

  return (
    <g onClick={isInteractive ? handleClick : undefined}>
      {/* 可见连线 */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={hovered || clicked ? Math.min(opacity * 2.5, 0.75) : opacity}
        strokeLinecap="round"
        strokeDasharray={dashArray}
        style={{ pointerEvents: 'none' }}
      />
      {/* 透明 hitbox（语义/逻辑边才需要交互） */}
      {isInteractive && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      {/* branch/category 边的普通 hover label */}
      {!isInteractive && displayLabel && hovered && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x={-22} y={-11} width={44} height={20} rx={6}
            fill="rgba(15,15,15,0.75)" style={{ pointerEvents: 'none' }} />
          <text x={0} y={4} textAnchor="middle" fill="white" fontSize={10} fontWeight={500}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            {displayLabel}
          </text>
        </g>
      )}
      {/* 语义/逻辑边：hover 时显示简要标签 */}
      {isInteractive && hovered && !clicked && displayLabel && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x={-26} y={-12} width={52} height={22} rx={7}
            fill={edgeType === 'logical' ? (RELATION_STYLES[relation ?? '']?.color ?? 'rgba(139,92,246,0.9)') : 'rgba(139,92,246,0.85)'}
            opacity={0.92}
            style={{ pointerEvents: 'none' }} />
          <text x={0} y={5} textAnchor="middle" fill="white" fontSize={10} fontWeight={600}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            {displayLabel}
          </text>
        </g>
      )}
      {/* 点击展开的解释面板 */}
      {isInteractive && clicked && (
        <g transform={`translate(${midX - panelW / 2}, ${midY - panelH - 12})`}>
          {/* 背景卡片 */}
          <rect
            x={0} y={0} width={panelW} height={panelH} rx={10}
            fill="rgba(15, 15, 20, 0.92)"
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}
          />
          {/* 顶部色条 */}
          <rect
            x={0} y={0} width={panelW} height={4} rx={10}
            fill={edgeType === 'logical' ? (RELATION_STYLES[relation ?? '']?.color ?? 'rgba(139,92,246,0.9)') : 'rgba(139,92,246,0.9)'}
            style={{ pointerEvents: 'none' }}
          />
          {/* 关系类型 */}
          <text x={12} y={22} fill="white" fontSize={12} fontWeight={700}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            {panelTitle}
          </text>
          {/* 分数 */}
          <text x={panelW - 12} y={22} textAnchor="end"
            fill="rgba(255,255,255,0.5)" fontSize={10}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            {panelScore}
          </text>
          {/* 原因说明 */}
          {panelReason && (
            <foreignObject x={10} y={30} width={panelW - 20} height={panelH - 36}>
              <div
                style={{
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: '10px',
                  lineHeight: '1.5',
                  fontFamily: 'system-ui, sans-serif',
                  wordBreak: 'break-all'
                }}
              >
                {panelReason}
              </div>
            </foreignObject>
          )}
          {/* 关闭提示 */}
          <text x={panelW / 2} y={panelH - 4} textAnchor="middle"
            fill="rgba(255,255,255,0.25)" fontSize={8}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            点击边关闭
          </text>
        </g>
      )}
    </g>
  )
})
