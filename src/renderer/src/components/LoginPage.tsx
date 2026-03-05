import { useState, useCallback } from 'react'
import { setAuthToken } from '../services/storageService'

const TOKEN_KEY = 'anima_access_token'

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const handleSubmit = useCallback(async () => {
    const t = token.trim()
    if (!t) {
      setError('请输入访问令牌')
      return
    }

    setIsChecking(true)
    setError('')

    // 注入 token 并验证（用一个轻量 API 请求探活）
    setAuthToken(t)
    try {
      const res = await fetch('/api/storage/nodes', {
        headers: { Authorization: `Bearer ${t}` }
      })
      if (res.ok || res.status === 404) {
        // 401/403 = token 错误；其他非鉴权错误视为通过
        localStorage.setItem(TOKEN_KEY, t)
        onLogin()
      } else if (res.status === 401 || res.status === 403) {
        setError('令牌无效，请重新输入')
        setAuthToken('')
      } else {
        // 后端其他错误，但 token 格式没问题，放行（离线也可进入）
        localStorage.setItem(TOKEN_KEY, t)
        onLogin()
      }
    } catch {
      // 网络异常时也放行（离线使用场景）
      localStorage.setItem(TOKEN_KEY, t)
      onLogin()
    } finally {
      setIsChecking(false)
    }
  }, [token, onLogin])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="w-full max-w-sm px-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Anima</h1>
          <p className="text-sm text-gray-400">请输入访问令牌以继续</p>
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
            {isChecking ? '验证中...' : '进入'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { TOKEN_KEY }
