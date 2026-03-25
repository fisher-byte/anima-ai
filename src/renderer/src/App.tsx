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
import { ACCESS_TOKEN_KEY, USER_TOKEN_KEY } from './constants/userToken'

export { USER_TOKEN_KEY } from './constants/userToken'

/** 只读客户端身份码；旧版 anima_access_token 在启动时迁移后不再参与 */
function readStoredToken(): string | null {
  return localStorage.getItem(USER_TOKEN_KEY)
}

/**
 * 历史版本曾用 anima_access_token 存「访问令牌」；与当前「每人 UUID 身份码」混用会导致首访异常。
 * 若仅有旧键，则写入 USER_TOKEN_KEY；随后删除旧键，保证单一身份源。
 */
/** @internal 导出供单测验证旧键迁移 */
export function migrateLegacyAccessTokenIfNeeded(): void {
  const user = localStorage.getItem(USER_TOKEN_KEY)?.trim()
  const access = localStorage.getItem(ACCESS_TOKEN_KEY)?.trim()
  if (!user && access) {
    localStorage.setItem(USER_TOKEN_KEY, access)
  }
  if (localStorage.getItem(USER_TOKEN_KEY)) {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  }
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

    migrateLegacyAccessTokenIfNeeded()

    // 无论服务端是否要求 Bearer：没有本地身份码时自动生成 UUID，每人独立库（与 middleware 的 token→userId 一致）
    let token = readStoredToken()
    if (!token) {
      token = crypto.randomUUID()
      localStorage.setItem(USER_TOKEN_KEY, token)
    } else if (!authRequired) {
      // 仅开放模式做「误指默认库」修正；生产鉴权下不清空 token，避免回到无身份请求
      const repaired = await repairStaleAutoToken(token)
      if (repaired === null && !localStorage.getItem(USER_TOKEN_KEY)) {
        token = crypto.randomUUID()
        localStorage.setItem(USER_TOKEN_KEY, token)
      } else {
        token = repaired ?? token
      }
    }

    setAuthToken(token)
    setAuthChecked(true)
    loadNodes()
    loadProfile()
  }, [loadNodes, loadProfile])

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

  if (!authChecked) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white text-sm text-gray-400">
        加载中…
      </div>
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
