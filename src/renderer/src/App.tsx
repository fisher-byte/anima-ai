import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { InputBox } from './components/InputBox'
import { AnswerModal } from './components/AnswerModal'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { OnboardingGuide } from './components/OnboardingGuide'
import { useCanvasStore } from './stores/canvasStore'
import { LayoutGroup, AnimatePresence } from 'framer-motion'

function App() {
  const { loadNodes, loadProfile, selectedNodeId } = useCanvasStore()

  useEffect(() => {
    // 应用启动时加载数据
    loadNodes()
    loadProfile()
  }, [loadNodes, loadProfile])

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F8F9FB]">
      <LayoutGroup>
        <Canvas />
        <InputBox />
        <AnswerModal />
        <AnimatePresence>
          {selectedNodeId && <NodeDetailPanel />}
        </AnimatePresence>
        <OnboardingGuide />
      </LayoutGroup>
    </div>
  )
}

export default App
