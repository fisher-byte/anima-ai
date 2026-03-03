/**
 * OnboardingGuide — 新手引导触发器 v4
 *
 * 不再渲染任何 UI，只在首次访问时自动调用 openOnboarding()
 * 所有引导交互都在 AnswerModal 内以 AI 主动发消息的方式完成。
 *
 * 完成标记：localStorage.evo_onboarding_v3
 */

import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

export function OnboardingGuide() {
  const openOnboarding = useCanvasStore(s => s.openOnboarding)
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current) return
    // 等待 loadNodes 异步完成后再决定（800ms 门控，与原逻辑保持一致）
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true

      if (localStorage.getItem('evo_onboarding_v3')) return
      if (useCanvasStore.getState().nodes.length > 0) return

      openOnboarding()
    }, 800)
    return () => clearTimeout(timer)
  }, [openOnboarding])

  return null
}
