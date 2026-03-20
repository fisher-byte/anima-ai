import { useState, useCallback } from 'react'
import { setAuthToken } from '../services/storageService'
import { useT } from '../i18n'
import { USER_TOKEN_KEY } from '../constants/userToken'

const TOKEN_KEY = 'anima_access_token'

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t } = useT()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const handleSubmit = useCallback(async () => {
    const tok = token.trim()
    if (!tok) {
      setError(t.login.enterToken)
      return
    }

    setIsChecking(true)
    setError('')

    // 注入 token 并验证（用 health 端点 + 带 token 探活）
    setAuthToken(tok)
    try {
      const res = await fetch('/api/storage/nodes.json', {
        headers: { Authorization: `Bearer ${tok}` }
      })
      if (res.ok || res.status === 404) {
        // token 有效（200=有数据, 404=新用户空库）
        localStorage.setItem(TOKEN_KEY, tok)
        // 与设置页「身份码」展示、多入口读 token 逻辑一致
        localStorage.setItem(USER_TOKEN_KEY, tok)
        // 已有服务端数据的用户跳过新手教程
        if (res.ok) {
          localStorage.setItem('evo_onboarding_v3', 'done')
        }
        onLogin()
      } else if (res.status === 401 || res.status === 403) {
        setError(t.login.invalidToken)
        setAuthToken('')
      } else {
        // 其他错误（如 500），不放行
        setError(t.login.serverError)
        setAuthToken('')
      }
    } catch {
      // 网络异常，不放行
      setError(t.login.networkError)
      setAuthToken('')
    } finally {
      setIsChecking(false)
    }
  }, [token, onLogin, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="w-full max-w-sm px-8">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
              <circle cx="16" cy="16" r="14" stroke="#111827" strokeWidth="1.5" fill="none" opacity="0.12"/>
              <circle cx="16" cy="16" r="3" fill="#111827"/>
              <circle cx="16" cy="5.5" r="2" fill="#111827" opacity="0.7"/>
              <circle cx="25.5" cy="22" r="2" fill="#111827" opacity="0.7"/>
              <circle cx="6.5" cy="22" r="2" fill="#111827" opacity="0.7"/>
              <line x1="16" y1="13" x2="16" y2="7.5" stroke="#111827" strokeWidth="1" opacity="0.35"/>
              <line x1="18.6" y1="17.5" x2="23.8" y2="20.5" stroke="#111827" strokeWidth="1" opacity="0.35"/>
              <line x1="13.4" y1="17.5" x2="8.2" y2="20.5" stroke="#111827" strokeWidth="1" opacity="0.35"/>
            </svg>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Anima</h1>
          </div>
          <p className="text-sm text-gray-400">{t.login.subtitle}</p>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ACCESS_TOKEN"
            autoFocus
            className={`w-full px-4 py-3 rounded-2xl border text-sm text-gray-800 placeholder-gray-300 outline-none transition-all ${
              error
                ? 'border-red-300 focus:border-red-400'
                : 'border-gray-200 focus:border-gray-900'
            }`}
          />

          {error && (
            <p className="text-xs text-red-500 px-1">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={isChecking || !token.trim()}
            className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-medium transition-all hover:bg-black disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            {isChecking ? t.login.verifying : t.login.enter}
          </button>
        </div>
      </div>
    </div>
  )
}

export { TOKEN_KEY }
