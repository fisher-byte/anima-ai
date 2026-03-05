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
    // 启动时读取 localStorage token 并注入
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) {
      setAuthToken(saved)
    }

    // 探活：检查后端是否要求鉴权（用合法白名单路径）
    fetch('/api/storage/nodes.json').then(res => {
      if (res.status === 401 || res.status === 403) {
        // 后端要求鉴权
        if (saved) {
          // 有保存的 token，先尝试用它
          fetch('/api/storage/nodes.json', {
            headers: { Authorization: `Bearer ${saved}` }
          }).then(r => {
            if (r.ok || r.status === 404) {
              setAuthed(true)
            }
            // token 失效则保持未登录状态
            setAuthChecked(true)
          }).catch(() => {
            setAuthed(true) // 网络错误放行
            setAuthChecked(true)
          })
        } else {
          setAuthChecked(true) // 无 token，显示登录页
        }
      } else {
        // 后端未启用鉴权，直接放行
        setAuthed(true)
        setAuthChecked(true)
      }
    }).catch(() => {
      // 后端不可达，如果有 token 就直接进入
      if (saved) setAuthed(true)
      setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (authed) {
      loadNodes()
      loadProfile()
    }
  }, [authed, loadNodes, loadProfile])

  if (!authChecked) return null // 启动检查中，不渲染任何内容

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
