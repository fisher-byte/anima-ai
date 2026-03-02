import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
  scale?: number
}

// Helper for opacity transition
function getOpacity(scale: number, min: number, max: number, type: 'fade-in' | 'fade-out') {
  if (type === 'fade-in') {
    if (scale < min) return 0
    if (scale > max) return 1
    return (scale - min) / (max - min)
  } else {
    if (scale < min) return 1
    if (scale > max) return 0
    return 1 - (scale - min) / (max - min)
  }
}

export function Edge({ sourceNode, targetNode, scale = 1 }: EdgeProps) {
  const { path, pathShadow, strokeWidth, opacity, blur, color } = useMemo(() => {
    // 节点中心位置
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60
    
    // 计算直线距离
    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.hypot(dx, dy)
    
    // 使用贝塞尔曲线增加流畅感，控制点偏移量根据距离动态调整
    const ctrlOffset = Math.min(Math.abs(dx) * 0.5, 150)
    
    const p = `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`
    const ps = `M ${sx} ${sy + 2} C ${sx + ctrlOffset} ${sy + 2}, ${tx - ctrlOffset} ${ty + 2}, ${tx} ${ty + 2}`
    
    // 伪 3D 效果参数：距离越远，线条越细、越淡、越模糊
    const maxDist = 1000
    const ratio = Math.max(0, 1 - dist / maxDist)
    const sw = 1.5 + ratio * 2 // 线宽在 1.5 到 3.5 之间变化
    const op = 0.05 + ratio * 0.15 // 透明度在 0.05 到 0.2 之间变化
    const b = (1 - ratio) * 2 // 模糊度在 0 到 2px 之间变化
    
    // Color based on source node category color
    // Extract rgb values from rgba string like 'rgba(219, 234, 254, 0.9)'
    const nodeColor = sourceNode.color || 'rgba(148, 163, 184, 0.9)'
    
    return { path: p, pathShadow: ps, strokeWidth: sw, opacity: op, blur: b, color: nodeColor }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, sourceNode.color])

  // LOD Opacity
  const lodOpacity = getOpacity(scale, 0.3, 0.5, 'fade-in')
  if (lodOpacity <= 0) return null

  return (
    <g className="group/edge">
      {/* 底层阴影/发光效果 */}
      <motion.path
        initial={{ opacity: 0 }}
        animate={{ opacity: opacity * 0.5 * lodOpacity, stroke: color }}
        d={pathShadow}
        fill="none"
        strokeWidth={strokeWidth * 3}
        className="pointer-events-none blur-md"
      />
      
      {/* 主线条 */}
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: opacity * lodOpacity,
          strokeWidth: strokeWidth,
          filter: `blur(${blur}px)`,
          stroke: color
        }}
        transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
        d={path}
        fill="none"
        className="transition-all duration-500 pointer-events-none"
        strokeLinecap="round"
      />
      
      {/* 装饰性流动微粒效果 (Active State) */}
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: [0, 1],
          opacity: [0, opacity * 2 * lodOpacity, 0],
          stroke: color,
          transition: { 
            duration: 4, 
            repeat: Infinity, 
            ease: "linear",
            repeatDelay: 1
          }
        }}
        d={path}
        fill="none"
        strokeWidth={strokeWidth * 0.6}
        className="pointer-events-none"
        strokeLinecap="round"
        strokeDasharray="2, 12"
      />
    </g>
  )
}
