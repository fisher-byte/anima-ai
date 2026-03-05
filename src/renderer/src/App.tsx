import { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { OnboardingGuide } from './components/OnboardingGuide'
import { LoginPage, TOKEN_KEY } from './components/LoginPage'
import { GlobalUI } from './components/GlobalUI'
import { useCanvasStore } from './stores/canvasStore'
import { setAuthToken } from './services/storageService'

function App() {
  const { loadNodes, loadProfile } = useCanvasStore()
  const [authed, setAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) {
      setAuthToken(saved)
    }

    // Step 1: 问后端是否需要鉴权
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(async (data: { authRequired: boolean }) => {
        if (!data.authRequired) {
          // 后端未启用鉴权，直接放行
          setAuthed(true)
          setAuthChecked(true)
          return
        }

        // 后端要求鉴权
        if (!saved) {
          // 没有保存的 token，显示登录页
          setAuthChecked(true)
          return
        }

        // Step 2: 用已保存的 token 验证是否还有效
        try {
          const r = await fetch('/api/storage/nodes.json', {
            headers: { Authorization: `Bearer ${saved}` }
          })
          if (r.ok || r.status === 404) {
            // token 有效
            // 已有服务端数据的用户跳过新手教程
            if (r.ok) {
              localStorage.setItem('evo_onboarding_v3', 'done')
            }
            setAuthed(true)
          } else {
            // token 失效（401/403），清除并显示登录页
            localStorage.removeItem(TOKEN_KEY)
            setAuthToken('')
          }
        } catch {
          // 网络错误，清除 token，显示登录页
          localStorage.removeItem(TOKEN_KEY)
          setAuthToken('')
        }
        setAuthChecked(true)
      })
      .catch(() => {
        // /api/auth/status 不可达，显示登录页
        setAuthChecked(true)
      })
  }, [])

  useEffect(() => {
    if (authed) {
      loadNodes()
      loadProfile()
    }
  }, [authed, loadNodes, loadProfile])

  if (!authChecked) return (
    <div className="fixed inset-0 bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
        <span className="text-xs text-gray-400">正在加载...</span>
      </div>
    </div>
  )

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <GlobalUI>
      <div className="relative w-full h-full overflow-hidden bg-white">
        <Canvas />
        <InputBox />
        <AnswerModal />
        <OnboardingGuide />
      </div>
    </GlobalUI>
  )
}

export default App
