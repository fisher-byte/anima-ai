/**
 * OnboardingGuide — 交互式新手引导
 *
 * 5 个阶段，全程贴在输入框上方，不遮挡画布，让用户边看边操作：
 *
 * Step 0 (idle)      → 欢迎提示，引导用户自我介绍
 * Step 1 (sent1)     → 检测到第一条对话（nodes 0→1），引导用户再说一句评价
 * Step 2 (sent2)     → 检测到第二条对话（nodes 1→2），提示关闭对话框
 * Step 3 (closed)    → 对话框已关闭、节点已分裂，引导用户再发一句"你好"
 * Step 4 (highlight) → 检测到记忆连线出现（highlightedNodeIds.length > 0），收尾
 * done               → 引导完成，隐藏
 */

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'

type Phase = 'idle' | 'sent1' | 'sent2' | 'closed' | 'highlight' | 'done'

const BUBBLE_W = 360

export function OnboardingGuide() {
  const nodes = useCanvasStore(state => state.nodes)
  const isModalOpen = useCanvasStore(state => state.isModalOpen)
  const highlightedNodeIds = useCanvasStore(state => state.highlightedNodeIds)

  const [phase, setPhase] = useState<Phase>('idle')
  const prevNodesLen = useRef(0)
  const prevModalOpen = useRef(false)
  const hasSeenHighlight = useRef(false)

  // 仅新用户（无节点 + 未完成引导）展示
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (nodes.length === 0 && !localStorage.getItem('evo_onboarding_v2')) {
      setShow(true)
    }
  }, [])

  // 状态机：监听 nodes 数量、modal、highlight 变化
  useEffect(() => {
    if (!show || phase === 'done') return

    const len = nodes.length
    const prev = prevNodesLen.current

    // sent1：第一次有节点
    if (phase === 'idle' && len === 1 && prev === 0) {
      setPhase('sent1')
    }
    // sent2：节点增加到 2+（第二轮对话完成）
    if (phase === 'sent1' && len >= 2 && prev < 2) {
      setPhase('sent2')
    }

    prevNodesLen.current = len
  }, [nodes.length, show, phase])

  useEffect(() => {
    if (!show || phase === 'done') return

    // closed：对话框关闭（从 sent2 阶段）
    if (phase === 'sent2' && prevModalOpen.current && !isModalOpen) {
      setPhase('closed')
    }
    prevModalOpen.current = isModalOpen
  }, [isModalOpen, show, phase])

  useEffect(() => {
    if (!show || phase === 'done') return

    // highlight：出现记忆连线（closed 阶段后用户发了一句话）
    if (phase === 'closed' && highlightedNodeIds.length > 0 && !hasSeenHighlight.current) {
      hasSeenHighlight.current = true
      setPhase('highlight')
    }
  }, [highlightedNodeIds.length, show, phase])

  const handleDismiss = () => {
    setPhase('done')
    setShow(false)
    localStorage.setItem('evo_onboarding_v2', 'true')
  }

  if (!show || phase === 'done') return null

  return (
    <AnimatePresence>
      <OnboardingBubble
        phase={phase}
        onDismiss={handleDismiss}
      />
    </AnimatePresence>
  )
}

// ── 气泡组件 ────────────────────────────────────────────────────────────────

function OnboardingBubble({ phase, onDismiss }: { phase: Phase; onDismiss: () => void }) {
  const content = getBubbleContent(phase)

  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{
        position: 'fixed',
        bottom: 148, // 输入框上方
        left: '50%',
        transform: 'translateX(-50%)',
        width: BUBBLE_W,
        zIndex: 50,
        pointerEvents: 'auto'
      }}
    >
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 px-5 py-4 relative">
        {/* 跳过按钮 */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 text-gray-300 hover:text-gray-500 transition-colors"
          title="跳过引导"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* 进度点 */}
        <div className="flex items-center gap-1 mb-3">
          {(['idle', 'sent1', 'sent2', 'closed', 'highlight'] as Phase[]).map((p) => (
            <div
              key={p}
              className={`h-1 rounded-full transition-all duration-300 ${
                p === phase
                  ? 'w-5 bg-gray-800'
                  : phaseIndex(p) < phaseIndex(phase)
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
            <p className="text-[13px] font-semibold text-gray-800 mb-0.5 leading-snug">
              {content.title}
            </p>
            <p className="text-[12px] text-gray-500 leading-relaxed whitespace-pre-line">
              {content.desc}
            </p>
          </div>
        </div>

        {/* 收尾步骤的完成按钮 */}
        {phase === 'highlight' && (
          <button
            onClick={onDismiss}
            className="mt-3 w-full bg-gray-900 hover:bg-black text-white text-[12px] font-bold py-2 rounded-xl transition-all active:scale-95"
          >
            开始探索
          </button>
        )}

        {/* 尖角指向输入框 */}
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
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.06))'
          }}
        />
      </div>
    </motion.div>
  )
}

// ── 文案 ────────────────────────────────────────────────────────────────────

function getBubbleContent(phase: Phase): { title: string; desc: string } {
  switch (phase) {
    case 'idle':
      return {
        title: '你好，我是 EvoCanvas',
        desc: '我会把你说的每件事变成可以生长的记忆节点。\n先来认识你——在下面跟我介绍一下自己吧。'
      }
    case 'sent1':
      return {
        title: '第一个节点诞生了',
        desc: '你的自我介绍已经成为一个记忆节点。\n现在告诉我——你觉得我刚才的回答怎么样？'
      }
    case 'sent2':
      return {
        title: '我记住你的口味了',
        desc: '我从你的评价中学到了你的偏好，以后会按这个风格回答。\n点右上角 × 关掉对话框，看看节点是怎么分布的。'
      }
    case 'closed':
      return {
        title: '两个节点，两段记忆',
        desc: '介绍和评价自动分开了，这就是 EvoCanvas 的分叉。\n现在随便说一句话，比如"你好"——看看会发生什么。'
      }
    case 'highlight':
      return {
        title: '看到那条虚线了吗',
        desc: '我想起了你的自我介绍，记忆连线自动亮起。\n点右上角 ⊞ 可以搜索、回顾所有对话。就这些，开始吧。'
      }
    default:
      return { title: '', desc: '' }
  }
}

function phaseIndex(p: Phase): number {
  return ['idle', 'sent1', 'sent2', 'closed', 'highlight', 'done'].indexOf(p)
}
