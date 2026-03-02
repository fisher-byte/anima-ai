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

  // Inverse scale to keep label readable when zoomed out
  const inverseScale = Math.max(1, (1 / Math.max(scale, 0.1)) * 0.6)

  return (
    <motion.div
      animate={{
        opacity: opacity,
        scale: opacity === 0 ? 0.5 : inverseScale,
      }}
      drag={isVisible}
      dragMomentum={false}
      onDrag={(_, info) => onDrag(info.delta.x / inverseScale, info.delta.y / inverseScale)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute flex items-center justify-center w-[400px] h-[200px] cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
      style={{
        left: cluster.x,
        top: cluster.y,
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: 20,
      }}
    >
      <div className="relative flex flex-col items-center group">
        <h1
          className="relative text-5xl font-black tracking-tighter text-gray-800 mb-2 drop-shadow-sm group-hover:scale-105 transition-transform select-none"
          style={{ textShadow: '0 2px 10px rgba(255,255,255,0.9)' }}
        >
          {cluster.category}
        </h1>
        <div className="relative flex items-center gap-2 text-sm font-medium text-gray-600 uppercase tracking-widest bg-white/60 px-3 py-1 rounded-full backdrop-blur-sm border border-gray-200/60 select-none">
          <Layers className="w-3 h-3" />
          <span>{cluster.count} MEMORIES</span>
        </div>
      </div>
    </motion.div>
  )
}
