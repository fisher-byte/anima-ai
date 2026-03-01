import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
}

export function Edge({ sourceNode, targetNode }: EdgeProps) {
  const { path, pathShadow } = useMemo(() => {
    // 节点中心位置
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60
    
    // 计算控制点以生成平滑曲线
    const dx = Math.abs(tx - sx)
    
    // 使用贝塞尔曲线增加流畅感，控制点偏移量根据距离动态调整
    const ctrlOffset = Math.min(dx * 0.5, 150)
    
    const p = `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`
    const ps = `M ${sx} ${sy + 2} C ${sx + ctrlOffset} ${sy + 2}, ${tx - ctrlOffset} ${ty + 2}, ${tx} ${ty + 2}`
    
    return { path: p, pathShadow: ps }
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y])

  return (
    <g className="group/edge">
      {/* 底层阴影/发光效果，增加“一团一团”的厚实感 */}
      <motion.path
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.05 }}
        d={pathShadow}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        className="text-blue-400 pointer-events-none blur-sm"
      />
      
      {/* 主线条 */}
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-blue-400/10 group-hover/edge:text-blue-400/40 transition-colors duration-500 pointer-events-none"
        strokeLinecap="round"
      />
      
      {/* 装饰性流动微粒效果 (可选，增加灵动感) */}
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: [0, 1],
          opacity: [0, 0.3, 0],
          transition: { 
            duration: 3, 
            repeat: Infinity, 
            ease: "linear",
            repeatDelay: 2
          }
        }}
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-blue-400/20 pointer-events-none"
        strokeLinecap="round"
        strokeDasharray="1, 10"
      />
    </g>
  )
}
