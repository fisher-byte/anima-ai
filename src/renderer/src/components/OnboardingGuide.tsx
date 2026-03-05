/**
 * OnboardingGuide — 新手引导触发器 v5
 *
 * 不再渲染任何 UI，只在首次访问时自动调用 openOnboarding()
 * 所有引导交互都在 AnswerModal 内以 AI 主动发消息的方式完成。
 *
 * 完成标记：localStorage.evo_onboarding_v3
 * 断点续引导：localStorage.evo_onboarding_phase（中途退出时写入，恢复时读取）
 */

import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

export function OnboardingGuide() {
  const openOnboarding = useCanvasStore(s => s.openOnboarding)
  const nodes = useCanvasStore(s => s.nodes)
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current) return
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true

      // 已完成，不再打开
      if (localStorage.getItem('evo_onboarding_v3')) return

      // 已有节点数据的老用户，自动标记并跳过引导
      if (nodes.length > 0) {
        localStorage.setItem('evo_onboarding_v3', 'done')
        return
      }

      // 首次进入 或 中途退出后恢复（无节点数量限制）
      openOnboarding()
    }, 800)
    return () => clearTimeout(timer)
  }, [openOnboarding])

  return null
}
