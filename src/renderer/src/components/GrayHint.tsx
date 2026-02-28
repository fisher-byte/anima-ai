import { UI_CONFIG } from '@shared/constants'

interface GrayHintProps {
  preferences: string[]
}

export function GrayHint({ preferences }: GrayHintProps) {
  if (preferences.length === 0) return null

  // 取第一条被应用的偏好
  const mainPreference = preferences[0]
  
  // 简化显示
  let hintText = ''
  if (mainPreference.includes('简洁')) {
    hintText = '简洁表达'
  } else if (mainPreference.includes('避免')) {
    hintText = '避免某些内容'
  } else if (mainPreference.includes('组织')) {
    hintText = '结构化输出'
  } else {
    hintText = '你的偏好'
  }

  return (
    <div className="mt-4 text-sm text-gray-hint italic animate-fade-in">
      {UI_CONFIG.GRAY_HINT_TEXT}{hintText}。
    </div>
  )
}
