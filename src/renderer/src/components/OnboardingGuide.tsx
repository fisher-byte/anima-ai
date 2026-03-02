import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Move, Command, ZoomIn } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'

export function OnboardingGuide() {
  const { nodes } = useCanvasStore()
  const [step, setStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  // Only show if no nodes exist (new user)
  useEffect(() => {
    // Simple check: if nodes are empty, assume new user. 
    // Ideally check a persistent flag in settings.
    if (nodes.length === 0) {
      const hasSeen = localStorage.getItem('evo_onboarding_completed')
      if (!hasSeen) {
        setIsVisible(true)
      }
    }
  }, [nodes])

  const handleComplete = () => {
    setIsVisible(false)
    localStorage.setItem('evo_onboarding_completed', 'true')
  }

  if (!isVisible) return null

  const steps = [
    { 
      icon: <Move className="w-6 h-6 text-blue-500" />,
      title: "自由漫游", 
      desc: "按住左键拖拽画布移动，\n使用滚轮或双指缩放视图。"
    },
    { 
      icon: <Command className="w-6 h-6 text-purple-500" />,
      title: "开启对话", 
      desc: "在底部输入框写下你的想法，\nAI 会帮你整理成思维节点。"
    },
    { 
      icon: <ZoomIn className="w-6 h-6 text-orange-500" />,
      title: "宏微观切换", 
      desc: "缩小画布可以看到思维板块，\n放大则进入细节查看具体内容。"
    }
  ]

  const current = steps[step]

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="pointer-events-auto bg-white rounded-3xl p-8 shadow-2xl w-[340px] text-center border border-white/40 relative overflow-hidden"
      >
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-purple-400 to-orange-400" />
        
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center shadow-inner">
            {current.icon}
          </div>
        </div>
        
        <h3 className="text-xl font-black text-gray-800 mb-3 tracking-tight">{current.title}</h3>
        <p className="text-gray-500 mb-8 leading-relaxed text-sm whitespace-pre-line">
          {current.desc}
        </p>
        
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              if (step < steps.length - 1) setStep(s => s + 1)
              else handleComplete()
            }}
            className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            {step < steps.length - 1 ? '下一步' : '开始探索'}
          </button>
          
          <div className="flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-gray-800' : 'w-1.5 bg-gray-200'
                }`} 
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
