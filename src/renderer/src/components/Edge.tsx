/**
 * Edge — 画布节点连线
 *
 * 职责：渲染两个节点间的语义/逻辑连线，支持 hover 标签和点击解释面板。
 *
 * 连线类型（edgeType）：
 *   'branch'   — 对话分支线（灰色实线，不可交互）
 *   'category' — 同类聚类线（极淡，hover 显示分类标签）
 *   'semantic' — 语义相似线（紫色渐变，置信度 → 线宽映射）
 *   'logical'  — 逻辑关系线（6 种颜色，见 RELATION_STYLES）
 *
 * 逻辑关系颜色系统（RELATION_STYLES）：
 *   深化了→蓝实线  解决了→绿实线  矛盾于→红虚线
 *   依赖于→灰实线  启发了→黄虚线  重新思考了→橙点划线
 *
 * 视觉规则：
 *   - 置信度 [0.7, 1.0] → 线宽 [1.2, 3.0] px
 *   - LOD：useLodScale 返回 scale < 0.3 时组件 return null
 *   - hover 标签 & 点击面板均为白色毛玻璃风格（与 NodeCard 一致）
 */
import { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
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
  /** 是否为刚提取的新逻辑边（触发入场动画） */
  isNew?: boolean
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
  sourceNode, targetNode, label, edgeType, weight, relation, reason, confidence, isNew
}: EdgeProps) {
  const scale = useLodScale([0.3, 0.5])
  const lodOpacity = scale < 0.3 ? 0 : scale > 0.5 ? 1 : (scale - 0.3) / 0.2
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)
  // 新逻辑边入场动画：播放一次路径绘制 + 短暂高亮
  const [isAnimating, setIsAnimating] = useState(isNew ?? false)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isNew) {
      setIsAnimating(true)
      animTimerRef.current = setTimeout(() => setIsAnimating(false), 2200)
    }
    return () => { if (animTimerRef.current) clearTimeout(animTimerRef.current) }
  }, [isNew])

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
  const panelTitle = edgeType === 'logical'
    ? (relation ?? '逻辑关联')
    : '语义关联'
  const panelScore = edgeType === 'logical'
    ? `置信度 ${((confidence ?? 0.75) * 100).toFixed(0)}%`
    : `相似度 ${((weight ?? 0.65) * 100).toFixed(0)}%`
  const panelReason = reason || (
    edgeType === 'semantic'
      ? (weight ?? 0) >= 0.85 ? '两次对话高度相关' : (weight ?? 0) >= 0.75 ? '话题有明显重叠' : '话题存在关联'
      : ''
  )

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* 新逻辑边入场：先绘制路径，再消退发光层 */}
      {isAnimating && edgeType === 'logical' && (
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 3}
          strokeOpacity={0}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          initial={{ pathLength: 0, strokeOpacity: 0.55 }}
          animate={{ pathLength: 1, strokeOpacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ pointerEvents: 'none', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      )}
      {/* 可见连线 */}
      {isAnimating && edgeType === 'logical' ? (
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          initial={{ pathLength: 0, strokeOpacity: 0 }}
          animate={{ pathLength: 1, strokeOpacity: hovered || clicked ? Math.min(opacity * 2.5, 0.75) : opacity }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
          style={{ pointerEvents: 'none', strokeWidth: strokeWidth }}
        />
      ) : (
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
      )}
      {/* 透明 hitbox（语义/逻辑边才需要交互） */}
      {isInteractive && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={handleClick}
        />
      )}
      {/* branch/category 边的普通 hover label */}
      {!isInteractive && displayLabel && hovered && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x={-22} y={-11} width={44} height={20} rx={6}
            fill="rgba(255,255,255,0.92)"
            stroke="rgba(200,200,215,0.6)" strokeWidth={1}
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.07))' }} />
          <text x={0} y={4} textAnchor="middle" fill="rgba(50,50,70,0.85)" fontSize={10} fontWeight={500}
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
            {displayLabel}
          </text>
        </g>
      )}
      {/* 语义/逻辑边：hover 时显示简要标签 */}
      {isInteractive && hovered && !clicked && displayLabel && (() => {
        const accentColor = edgeType === 'logical'
          ? (RELATION_STYLES[relation ?? '']?.color ?? 'rgba(139,92,246,0.9)')
          : 'rgba(139,92,246,0.9)'
        const labelW = displayLabel.length * 13 + 24
        return (
          <g transform={`translate(${midX}, ${midY})`}>
            <rect x={-labelW/2} y={-13} width={labelW} height={24} rx={8}
              fill="rgba(255,255,255,0.92)"
              stroke={accentColor} strokeWidth={1} strokeOpacity={0.4}
              style={{ pointerEvents: 'none', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.08))' }} />
            <text x={0} y={5} textAnchor="middle" fill={accentColor} fontSize={11} fontWeight={600}
              style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
              {displayLabel}
            </text>
          </g>
        )
      })()}
      {/* 点击展开的解释面板 */}
      {isInteractive && clicked && (() => {
        const accentColor = edgeType === 'logical'
          ? (RELATION_STYLES[relation ?? '']?.color ?? 'rgba(139,92,246,0.9)')
          : 'rgba(139,92,246,0.9)'
        const panelW2 = Math.max(160, Math.min(240, (panelReason?.length ?? 0) * 11 + 48))
        const panelH2 = panelReason ? 82 : 52
        return (
          <g transform={`translate(${midX - panelW2 / 2}, ${midY - panelH2 - 14})`}>
            {/* 白色毛玻璃背景 */}
            <rect
              x={0} y={0} width={panelW2} height={panelH2} rx={12}
              fill="rgba(255,255,255,0.93)"
              stroke="rgba(220,220,235,0.8)" strokeWidth={1}
              style={{ pointerEvents: 'none', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.10))' }}
            />
            {/* 左侧 accent 竖条 */}
            <rect x={0} y={8} width={3} height={panelH2 - 16} rx={2}
              fill={accentColor} style={{ pointerEvents: 'none' }} />
            {/* 标题 */}
            <text x={16} y={22} fill="#1a1a2e" fontSize={12} fontWeight={700}
              style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
              {panelTitle}
            </text>
            {/* 分数 badge */}
            <rect x={panelW2 - 58} y={11} width={50} height={16} rx={8}
              fill={accentColor} fillOpacity={0.12} style={{ pointerEvents: 'none' }} />
            <text x={panelW2 - 33} y={22} textAnchor="middle"
              fill={accentColor} fontSize={9} fontWeight={600}
              style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
              {panelScore}
            </text>
            {/* reason 文字 */}
            {panelReason && (
              <foreignObject x={14} y={30} width={panelW2 - 24} height={panelH2 - 38}>
                <div style={{
                  color: 'rgba(60,60,80,0.85)', fontSize: '10px',
                  lineHeight: '1.6', fontFamily: 'system-ui, sans-serif',
                  wordBreak: 'break-all'
                }}>
                  {panelReason}
                </div>
              </foreignObject>
            )}
            {/* 关闭提示 */}
            <text x={panelW2 / 2} y={panelH2 - 5} textAnchor="middle"
              fill="rgba(150,150,170,0.6)" fontSize={8}
              style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
              再次点击关闭
            </text>
          </g>
        )
      })()}
    </g>
  )
})
