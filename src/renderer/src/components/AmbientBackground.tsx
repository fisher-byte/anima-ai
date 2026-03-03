import { useCanvasStore } from '../stores/canvasStore'
import { useLodScale } from '../hooks/useLodScale'
import { useMemo } from 'react'

export function AmbientBackground() {
  const nodes = useCanvasStore(state => state.nodes)
  // 只在 LOD 阈值跨越时触发重渲染
  const scale = useLodScale([0.7])

  const activeColor = useMemo(() => {
    if (nodes.length === 0) return '#E2E8F0'

    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      const cat = n.category || '其他'
      counts[cat] = (counts[cat] || 0) + 1
    })

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const dominantCat = sorted[0][0]

    if (dominantCat === '工作学习') return '#93C5FD'
    if (dominantCat === '生活日常') return '#6EE7B7'
    if (dominantCat === '灵感创意') return '#C4B5FD'

    return '#E2E8F0'
  }, [nodes])

  if (scale < 0.7) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
      <div
        className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%]"
        style={{
          opacity: 0.08,
          filter: 'blur(40px)',
          background: `conic-gradient(from 0deg at 50% 50%, ${activeColor} 0deg, transparent 80deg, ${activeColor} 150deg, transparent 220deg, ${activeColor} 290deg, transparent 360deg)`,
          transition: 'background 2s ease'
        }}
      />
    </div>
  )
}
