/**
 * OnboardingGuide — 交互式新手引导 v3
 *
 * 状态机（4步，无竞态）：
 *
 *   idle      → 欢迎，引导自我介绍（等待 nodes +1）
 *   sent1     → 第一轮节点落下，引导评价（等待 nodes +2）
 *   open2     → 第二轮节点落下，提示偏好学习（等待 highlightedNodeIds > 0）
 *   highlight → 记忆连线出现，收尾
 *   done      → 不渲染
 *
 * 时序说明：
 *   endConversation() 总在 handleClose() 后 ~500ms 才写节点
 *   所以"节点写入"时模态框必然已关，不再需要监听 modal close
 */

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'

type Phase = 'idle' | 'sent1' | 'open2' | 'highlight' | 'done'

export function OnboardingGuide() {
  const nodes = useCanvasStore(state => state.nodes)
  const highlightedNodeIds = useCanvasStore(state => state.highlightedNodeIds)

  const [show, setShow] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  const baseLen = useRef(0)
  const highlightTriggered = useRef(false)
  const decided = useRef(false)

  // ── 等 loadNodes 完成再决定是否展示（800ms 门控）────────────────────────────
  useEffect(() => {
    if (decided.current) return
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true
      if (localStorage.getItem('evo_onboarding_v2')) { setShow(false); return }
      if (useCanvasStore.getState().nodes.length > 0) { setShow(false); return }
      baseLen.current = 0
      setShow(true)
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  // ── 状态机：全部由 nodes.length 驱动（无竞态）──────────────────────────────
  useEffect(() => {
    if (!show || phase === 'done') return
    const added = nodes.length - baseLen.current

    if (phase === 'idle' && added >= 1) { setPhase('sent1'); return }
    if (phase === 'sent1' && added >= 2) { setPhase('open2'); return }
  }, [nodes.length, show, phase])

  // ── 记忆连线高亮 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!show || phase !== 'open2') return
    if (highlightedNodeIds.length > 0 && !highlightTriggered.current) {
      highlightTriggered.current = true
      setPhase('highlight')
    }
  }, [highlightedNodeIds.length, show, phase])

  const handleDismiss = () => {
    setShow(false)
    setPhase('done')
    localStorage.setItem('evo_onboarding_v2', 'true')
  }

  if (!show || phase === 'done') return null

  return (
    <AnimatePresence>
      <Bubble key={phase} phase={phase} onDismiss={handleDismiss} />
    </AnimatePresence>
  )
}

// ── 气泡 UI ──────────────────────────────────────────────────────────────────

function Bubble({ phase, onDismiss }: { phase: Phase; onDismiss: () => void }) {
  const { title, desc } = CONTENT[phase] ?? { title: '', desc: '' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 152,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 360,
        zIndex: 50,
        pointerEvents: 'auto'
      }}
    >
      <div className="bg-white/96 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100/80 px-5 py-4 relative">

        {/* 跳过 */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all"
          title="跳过引导"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* 进度点：4步 */}
        <div className="flex items-center gap-1 mb-3">
          {PHASES.map((p) => (
            <div
              key={p}
              className={`h-1 rounded-full transition-all duration-300 ${
                p === phase
                  ? 'w-5 bg-gray-800'
                  : PHASE_IDX[p] < PHASE_IDX[phase]
                  ? 'w-1.5 bg-gray-400'
                  : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* 内容 */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-gray-50 flex items-center justify-center mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-800 mb-1 leading-snug">{title}</p>
            <p className="text-[12px] text-gray-500 leading-relaxed whitespace-pre-line">{desc}</p>
          </div>
        </div>

        {/* 最后一步完成按钮 */}
        {phase === 'highlight' && (
          <button
            onClick={onDismiss}
            className="mt-3 w-full bg-gray-900 hover:bg-black text-white text-[12px] font-bold py-2.5 rounded-xl transition-all active:scale-95"
          >
            开始探索
          </button>
        )}

        {/* 尖角 */}
        <div
          style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 12,
            height: 6,
            background: 'white',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.05))'
          }}
        />
      </div>
    </motion.div>
  )
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const PHASES: Phase[] = ['idle', 'sent1', 'open2', 'highlight']
const PHASE_IDX: Record<Phase, number> = {
  idle: 0, sent1: 1, open2: 2, highlight: 3, done: 4
}

const CONTENT: Partial<Record<Phase, { title: string; desc: string }>> = {
  idle: {
    title: '你好，我是 EvoCanvas',
    desc: '我会把你说的每件事变成可以生长的记忆节点。\n先来认识你——在下面跟我介绍一下自己吧。'
  },
  sent1: {
    title: '第一个记忆节点诞生了 ✦',
    desc: '你的自我介绍已经存下来了。\n现在告诉我：你觉得我刚才回答得怎么样？'
  },
  open2: {
    title: '偏好学到了，节点分开了',
    desc: '我从你的评价里学到了你的口味，以后按这个风格回答。\n两段对话自动变成了两个节点——这就是 EvoCanvas 的生长。\n\n现在随便说一句话试试，比如"你好"。'
  },
  highlight: {
    title: '看到那条虚线了吗 ✦',
    desc: '我想起了你的自我介绍，记忆连线自动亮起。\n点右上角 ⊞ 可以搜索和回顾所有记忆。就这些，开始吧。'
  }
}
