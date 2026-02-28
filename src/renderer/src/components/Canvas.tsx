import { useState, useRef, useCallback } from 'react'
import { useCanvasStore } from '../stores/canvasStore'
import { NodeCard } from './NodeCard'

export function Canvas() {
  const { nodes } = useCanvasStore()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 画布拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在点击画布空白处时拖拽
    if (e.target === canvasRef.current) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 dot-grid cursor-grab active:cursor-grabbing overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        width: '200%',
        height: '200%',
        left: '-50%',
        top: '-50%'
      }}
    >
      {/* 节点渲染 */}
      {nodes.map((node) => (
        <NodeCard 
          key={node.id} 
          node={node} 
          offset={offset}
        />
      ))}
      
      {/* 空状态提示 */}
      {nodes.length === 0 && (
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm select-none pointer-events-none"
        >
          画布空空如也，开始你的第一次对话吧
        </div>
      )}
    </div>
  )
}
