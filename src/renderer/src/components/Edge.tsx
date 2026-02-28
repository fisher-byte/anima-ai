import type { Edge, Node, NodePosition } from '@shared/types'

interface EdgeProps {
  edge: Edge
  nodes: Node[]
  offset: NodePosition
}

export function EdgeLine({ edge, nodes, offset }: EdgeProps) {
  const sourceNode = nodes.find(n => n.id === edge.source)
  const targetNode = nodes.find(n => n.id === edge.target)
  
  if (!sourceNode || !targetNode) return null

  // 计算节点中心点（考虑画布偏移）
  const x1 = sourceNode.x - offset.x + 96  // 96 = 卡片宽度的一半
  const y1 = sourceNode.y - offset.y + 40  // 40 = 卡片高度的一半
  const x2 = targetNode.x - offset.x + 96
  const y2 = targetNode.y - offset.y + 40

  // 计算连线路径（简单的直线）
  const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x1,
        top: y1,
        width: length,
        height: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        transform: `rotate(${angle}deg)`,
        transformOrigin: '0 50%',
        zIndex: 0
      }}
    >
      {/* 连线标签 */}
      {edge.label && (
        <div
          className="absolute text-xs text-gray-400 whitespace-nowrap"
          style={{
            left: '50%',
            top: -16,
            transform: 'translateX(-50%)'
          }}
        >
          {edge.label}
        </div>
      )}
    </div>
  )
}
