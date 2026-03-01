import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Node } from '@shared/types'

interface EdgeProps {
  sourceNode: Node
  targetNode: Node
}

export function Edge({ sourceNode, targetNode }: EdgeProps) {
  const path = useMemo(() => {
    // 节点中心位置 (NodeCard 宽度 208px, 对应 w-52)
    const sx = sourceNode.x + 104
    const sy = sourceNode.y + 60
    const tx = targetNode.x + 104
    const ty = targetNode.y + 60
    
    return `M ${sx} ${sy} L ${tx} ${ty}`
  }, [sourceNode.x, sourceNode.y, targetNode.x, targetNode.y])

  return (
    <motion.path
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
      d={path}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-blue-200/20"
      strokeDasharray="4 4"
    />
  )
}
