import { motion } from 'framer-motion'
import { useCanvasStore } from '../stores/canvasStore'
import { useMemo } from 'react'

export function AmbientBackground() {
  const { nodes } = useCanvasStore()
  
  // Calculate the dominant category to set the aurora color
  // Simple logic: find the category with the most nodes
  const activeColor = useMemo(() => {
    if (nodes.length === 0) return '#E2E8F0' // Default gray

    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      const cat = n.category || '其他'
      counts[cat] = (counts[cat] || 0) + 1
    })
    
    // Sort by count
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const dominantCat = sorted[0][0]
    
    // Map category to color (faint aurora colors)
    // Blue for work/study, Green for life, Purple for creativity
    if (dominantCat === '工作学习') return '#93C5FD' // blue-300
    if (dominantCat === '生活日常') return '#6EE7B7' // green-300
    if (dominantCat === '灵感创意') return '#C4B5FD' // purple-300
    
    return '#E2E8F0'
  }, [nodes])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Noise Texture for Paper-like feel */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* Aurora Gradient Layer — very subtle, just a hint of color */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 300, repeat: Infinity, ease: "linear" }}
        className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%]"
        style={{
          opacity: 0.12,
          filter: 'blur(80px)',
          background: `conic-gradient(from 0deg at 50% 50%, ${activeColor} 0deg, transparent 80deg, ${activeColor} 150deg, transparent 220deg, ${activeColor} 290deg, transparent 360deg)`,
          transition: 'background 2s ease'
        }}
      />
    </div>
  )
}
