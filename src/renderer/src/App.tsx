import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { OnboardingGuide } from './components/OnboardingGuide'
import { GlobalUI } from './components/GlobalUI'
import { FeedbackButton } from './components/FeedbackButton'
import { LanguageProvider } from './i18n'
import { useCanvasStore } from './stores/canvasStore'
import { setAuthToken } from './services/storageService'

// Key under which the user's auto-generated UUID token is stored
export const USER_TOKEN_KEY = 'anima_user_token'

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

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const existing = localStorage.getItem(USER_TOKEN_KEY)
      const repairedToken = await repairStaleAutoToken(existing)
      if (cancelled) return

      setAuthToken(repairedToken ?? '')
      loadNodes()
      loadProfile()
    })()

    return () => {
      cancelled = true
    }
  }, [loadNodes, loadProfile])

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
