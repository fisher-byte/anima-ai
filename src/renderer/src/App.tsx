import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { OnboardingGuide } from './components/OnboardingGuide'
import { useCanvasStore } from './stores/canvasStore'

function App() {
  const { loadNodes, loadProfile } = useCanvasStore()

  useEffect(() => {
    // 应用启动时加载数据
    loadNodes()
    loadProfile()
  }, [loadNodes, loadProfile])

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
      <Canvas />
      <InputBox />
      <AnswerModal />
      <OnboardingGuide />
    </div>
  )
}

export default App
