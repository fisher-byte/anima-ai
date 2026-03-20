import { useEffect, useState, useCallback } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { OnboardingGuide } from './components/OnboardingGuide'
import { GlobalUI } from './components/GlobalUI'
import { FeedbackButton } from './components/FeedbackButton'
import { LanguageProvider } from './i18n'
import { useCanvasStore } from './stores/canvasStore'
import { setAuthToken } from './services/storageService'
import { LoginPage } from './components/LoginPage'
import { ACCESS_TOKEN_KEY, USER_TOKEN_KEY } from './constants/userToken'

export { USER_TOKEN_KEY } from './constants/userToken'

function readStoredToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(USER_TOKEN_KEY)
}

async function hasUsableKey(token?: string): Promise<boolean> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch('/api/config/has-usable-key', { headers })
    if (!res.ok) return false
    const data = await res.json() as { hasKey?: boolean }
    return !!data.hasKey
  } catch {
    return false
  }
}

/**
 * 仅在「未要求鉴权」的开发/开放模式下使用：修正误指向默认库的 token。
 * 生产环境要求鉴权时不得清空 token，否则仍会请求到无身份路径（应直接 401）。
 */
export async function repairStaleAutoToken(existingToken: string | null): Promise<string | null> {
  if (!existingToken) return null
  const currentDbHasKey = await hasUsableKey(existingToken)
  if (currentDbHasKey) return existingToken

  const defaultDbHasKey = await hasUsableKey()
  if (!defaultDbHasKey) return existingToken

  localStorage.removeItem(USER_TOKEN_KEY)
  return null
}

function App() {
  const { loadNodes, loadProfile } = useCanvasStore()
  const [authChecked, setAuthChecked] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)

  const bootstrapAuth = useCallback(async () => {
    let authRequired = false
    try {
      const res = await fetch('/api/auth/status')
      if (res.ok) {
        const data = (await res.json()) as { authRequired?: boolean }
        authRequired = !!data.authRequired
      }
    } catch {
      /* 网络失败时仍尝试用本地 token，避免完全不可用 */
    }

    if (authRequired) {
      const existing = readStoredToken()
      if (!existing) {
        setNeedLogin(true)
        setAuthChecked(true)
        return
      }
      setAuthToken(existing)
      setNeedLogin(false)
      setAuthChecked(true)
      loadNodes()
      loadProfile()
      return
    }

    // 本地/开放模式：保证有一条客户端身份码，避免多人落到同一默认库
    let token = readStoredToken()
    if (!token) {
      token = crypto.randomUUID()
      localStorage.setItem(USER_TOKEN_KEY, token)
    } else {
      const repaired = await repairStaleAutoToken(token)
      if (repaired === null && !localStorage.getItem(USER_TOKEN_KEY)) {
        token = crypto.randomUUID()
        localStorage.setItem(USER_TOKEN_KEY, token)
      } else {
        token = repaired ?? token
      }
    }
    setAuthToken(token)
    setNeedLogin(false)
    setAuthChecked(true)
    loadNodes()
    loadProfile()
  }, [loadNodes, loadProfile])

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

  const handleLoggedIn = useCallback(() => {
    const t = readStoredToken()
    if (t) setAuthToken(t)
    setNeedLogin(false)
    loadNodes()
    loadProfile()
  }, [loadNodes, loadProfile])

  if (!authChecked) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white text-sm text-gray-400">
        加载中…
      </div>
    )
  }

  if (needLogin) {
    return (
      <LanguageProvider>
        <LoginPage onLogin={handleLoggedIn} />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider>
      <GlobalUI>
        <div className="relative w-full h-full overflow-hidden bg-white">
          <Canvas />
          <InputBox />
          <FeedbackButton />
          <AnswerModal />
          <OnboardingGuide />
        </div>
      </GlobalUI>
    </LanguageProvider>
  )
}

export default App
