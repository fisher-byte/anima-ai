import { useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import type { Node, NodePosition } from '@shared/types'

interface NodeCardProps {
  node: Node
  offset: NodePosition
}

export function NodeCard({ node, offset }: NodeCardProps) {
  const { openModal } = useCanvasStore()

  const handleClick = useCallback(() => {
    // 打开对应对话回放
    const conversation = {
      id: node.conversationId,
      createdAt: node.date,
      userMessage: '', // 从存储中加载完整对话
      assistantMessage: ''
    }
    openModal(conversation)
  }, [node, openModal])

  return (
    <div
      className="absolute animate-slide-up cursor-pointer group"
      style={{
        left: `${node.x}px`,
        top: `${node.y}px`,
        transform: `translate(${-offset.x}px, ${-offset.y}px)`
      }}
      onClick={handleClick}
    >
      <div className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-4 w-48 border border-gray-100 group-hover:border-gray-200">
        {/* 标题 */}
        <h3 className="font-semibold text-gray-800 mb-2 truncate">
          {node.title}
        </h3>
        
        {/* 关键词 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {node.keywords.map((keyword, idx) => (
            <span 
              key={idx}
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
            >
              {keyword}
            </span>
          ))}
        </div>
        
        {/* 日期 */}
        <div className="text-xs text-gray-400">
          {node.date}
        </div>
      </div>
    </div>
  )
}
