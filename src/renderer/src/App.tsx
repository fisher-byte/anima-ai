import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { OnboardingGuide } from './components/OnboardingGuide'
import { GlobalUI } from './components/GlobalUI'
import { FeedbackButton } from './components/FeedbackButton'
import { LanguageProvider } from './i18n'
import { useCanvasStore } from './stores/canvasStore'
import { setAuthToken, getAuthToken } from './services/storageService'

// Key under which the user's auto-generated UUID token is stored
export const USER_TOKEN_KEY = 'anima_user_token'

/** Return existing token or generate a new UUID and persist it */
function getOrCreateToken(): string {
  const existing = localStorage.getItem(USER_TOKEN_KEY)
  if (existing) return existing
  // Generate a UUID v4-style token
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
  localStorage.setItem(USER_TOKEN_KEY, uuid)
  return uuid
}

function App() {
  const { loadNodes, loadProfile } = useCanvasStore()

  useEffect(() => {
    // Ensure a token is set before any API calls
    if (!getAuthToken()) {
      const token = getOrCreateToken()
      setAuthToken(token)
    }
    loadNodes()
    loadProfile()
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
