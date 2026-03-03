import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface OnboardingCompletePopupProps {
  onDismiss: () => void
}

/**
 * 新手引导完成弹窗（唯一允许使用弹窗形式的最终阶段）
 * 引导用户输入"你好"开始自由探索。
 */
export function OnboardingCompletePopup({ onDismiss }: OnboardingCompletePopupProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/30" onClick={onDismiss} />
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="relative bg-white rounded-3xl shadow-2xl px-8 py-7 w-80 text-center z-10"
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gray-900 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-yellow-400" />
        </div>
        <h3 className="text-[15px] font-bold text-gray-900 mb-2">已拆分成两个节点</h3>
        <p className="text-[12px] text-gray-500 leading-relaxed mb-5">
          你的对话已保存到画布，接下来<span className="font-bold text-gray-800">自由探索</span>就好——
          随便问我什么，我都会自动帮你整理记忆。
        </p>
        <button
          onClick={onDismiss}
          className="w-full bg-gray-900 hover:bg-black text-white text-[13px] font-bold py-3 rounded-2xl transition-all active:scale-95"
        >
          开始探索
        </button>
      </motion.div>
    </motion.div>
  )
}
