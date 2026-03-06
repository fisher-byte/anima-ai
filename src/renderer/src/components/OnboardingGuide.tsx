import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

export function OnboardingGuide() {
  const openOnboarding = useCanvasStore(s => s.openOnboarding)
  const nodes = useCanvasStore(s => s.nodes)
  const nodesLoaded = useCanvasStore(s => s.nodesLoaded)
  const decided = useRef(false)

  useEffect(() => {
    // 节点还没加载完，等待
    if (!nodesLoaded) return
    if (decided.current) return
    decided.current = true

    // 已完成，不再打开
    if (localStorage.getItem('evo_onboarding_v3') === 'done') return

    // 已有节点数据的老用户，自动标记并跳过引导
    if (nodes.some(n => n.nodeType !== 'capability')) {
      localStorage.setItem('evo_onboarding_v3', 'done')
      return
    }

    // 首次进入 或 中途退出后恢复
    openOnboarding()
  }, [nodesLoaded, nodes, openOnboarding])

  return null
}
