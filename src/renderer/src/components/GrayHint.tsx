import { useT } from '../i18n'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface GrayHintProps {
  preferences: string[]
  type?: 'preference' | 'memory' | 'evolution'
  message?: string
}

export function GrayHint({ preferences, type = 'preference', message }: GrayHintProps) {
  const { t } = useT()
  if (type === 'preference' && preferences.length === 0) return null

  let hintText = message || ''

  if (type === 'preference') {
    // 取第一条被应用的偏好
    const mainPreference = preferences[0]

    // 简化显示
    if (mainPreference.includes('简洁') || mainPreference.toLowerCase().includes('concise')) {
      hintText = t.grayHint.concise
    } else if (mainPreference.includes('避免') || mainPreference.toLowerCase().includes('avoid')) {
      hintText = t.grayHint.avoid
    } else if (mainPreference.includes('组织') || mainPreference.toLowerCase().includes('structur')) {
      hintText = t.grayHint.structured
    } else {
      hintText = t.grayHint.yourPref
    }
    hintText = `${t.grayHint.prefix}${hintText}。`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 flex items-center gap-2 text-xs text-gray-400 italic"
    >
      <Sparkles className="w-3 h-3 text-blue-400/60" />
      <span>{hintText}</span>
    </motion.div>
  )
}
