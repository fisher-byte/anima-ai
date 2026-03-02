import { motion } from 'framer-motion'
import { Layers } from 'lucide-react'

interface Cluster {
  id: string
  category: string
  x: number
  y: number
  color: string
  count: number
}

interface ClusterLabelProps {
  cluster: Cluster
  scale: number
  onDrag: (dx: number, dy: number) => void
  onClick: () => void
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

export function ClusterLabel({ cluster, scale, onDrag, onClick }: ClusterLabelProps) {
  // Fade out between 0.4 and 0.6 scale
  const opacity = getOpacity(scale, 0.4, 0.6, 'fade-out')
  const isVisible = opacity > 0

  return (
    <motion.div
      initial={{ scale: 0.5 }}
      animate={{ 
        opacity: opacity,
        scale: opacity === 0 ? 0.5 : 1,
        // Center the label (assuming average node width/height adjustments if needed, 
        // here we place it at cluster center)
        left: cluster.x, 
        top: cluster.y,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
      drag={isVisible} 
      dragMomentum={false}
      onDrag={(_, info) => onDrag(info.delta.x, info.delta.y)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute z-20 flex items-center justify-center w-[300px] h-[100px] cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
    >
      <div className="relative flex flex-col items-center group">
        <div 
          className="absolute inset-0 rounded-full blur-[60px] opacity-40 transition-opacity group-hover:opacity-60"
          style={{ backgroundColor: cluster.color }}
        />
        <h1 
          className="text-4xl font-black tracking-tighter text-gray-800/80 mb-2 drop-shadow-sm group-hover:scale-105 transition-transform select-none"
          style={{ textShadow: '0 2px 10px rgba(255,255,255,0.8)' }}
        >
          {cluster.category}
        </h1>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500/80 uppercase tracking-widest bg-white/40 px-3 py-1 rounded-full backdrop-blur-sm border border-white/20 select-none">
          <Layers className="w-3 h-3" />
          <span>{cluster.count} MEMORIES</span>
        </div>
      </div>
    </motion.div>
  )
}
