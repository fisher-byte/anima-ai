import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, ExternalLink, ArrowLeft } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { IMPORT_MEMORY_PROMPTS } from '@shared/constants'

interface Platform {
  id: keyof typeof IMPORT_MEMORY_PROMPTS
  name: string
  url: string
  color: string
  textColor: string
}

const PLATFORMS: Platform[] = [
  { id: 'chatgpt',  name: 'ChatGPT',  url: 'https://chat.openai.com',     color: 'bg-[#10a37f]',  textColor: 'text-white' },
  { id: 'claude',   name: 'Claude',   url: 'https://claude.ai',           color: 'bg-[#d97706]',  textColor: 'text-white' },
  { id: 'gemini',   name: 'Gemini',   url: 'https://gemini.google.com',   color: 'bg-[#4285f4]',  textColor: 'text-white' }
]

type Step = 'select' | 'copy' | 'paste'

export function ImportMemoryModal() {
  const activeCapabilityId = useCanvasStore(state => state.activeCapabilityId)
  const closeCapability = useCanvasStore(state => state.closeCapability)
  const saveMemoryImport = useCanvasStore(state => state.saveMemoryImport)

  const [step, setStep] = useState<Step>('select')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [copied, setCopied] = useState(false)
  const [pasteContent, setPasteContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isOpen = activeCapabilityId !== null && activeCapabilityId.includes('import-memory')

  const handleSelectPlatform = useCallback((p: Platform) => {
    setSelectedPlatform(p)
    setStep('copy')
    setCopied(false)
  }, [])

  const handleCopyPrompt = useCallback(async () => {
    if (!selectedPlatform) return
    const prompt = IMPORT_MEMORY_PROMPTS[selectedPlatform.id]
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
  }, [selectedPlatform])

  const handleOpenPlatform = useCallback(() => {
    if (!selectedPlatform) return
    window.open(selectedPlatform.url, '_blank')
    setTimeout(() => setStep('paste'), 800)
  }, [selectedPlatform])

  const handleSave = useCallback(async () => {
    const content = pasteContent.trim()
    if (!content || isSaving) return
    setIsSaving(true)
    try {
      await saveMemoryImport(content, selectedPlatform?.name ?? '外部AI')
      setStep('select')
      setPasteContent('')
      setSelectedPlatform(null)
      closeCapability()
    } finally {
      setIsSaving(false)
    }
  }, [pasteContent, isSaving, selectedPlatform, saveMemoryImport, closeCapability])

  const handleClose = useCallback(() => {
    setStep('select')
    setPasteContent('')
    setSelectedPlatform(null)
    setCopied(false)
    closeCapability()
  }, [closeCapability])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative w-[460px] bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div className="flex items-center gap-2">
                {step !== 'select' && (
                  <button
                    onClick={() => setStep(step === 'paste' ? 'copy' : 'select')}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors mr-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <div className="text-[15px] font-bold text-gray-900">导入外部记忆</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {step === 'select' && '选择你想导入记忆的 AI 平台'}
                    {step === 'copy' && `已选：${selectedPlatform?.name}，复制提示词后前往对话`}
                    {step === 'paste' && '将 AI 回答粘贴到下方，我们会提取成记忆节点'}
                  </div>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pb-6">
              {/* Step 1: 选平台 */}
              {step === 'select' && (
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPlatform(p)}
                      className={`flex flex-col items-center gap-2 py-5 rounded-2xl ${p.color} ${p.textColor} font-semibold text-[14px] hover:opacity-90 active:scale-95 transition-all shadow-sm`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: 复制 prompt + 跳转 */}
              {step === 'copy' && selectedPlatform && (
                <div className="mt-2 space-y-3">
                  <div className="bg-gray-50 rounded-2xl p-4 text-[12px] text-gray-600 leading-relaxed font-mono whitespace-pre-line max-h-44 overflow-y-auto">
                    {IMPORT_MEMORY_PROMPTS[selectedPlatform.id]}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyPrompt}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium hover:bg-gray-50 transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      {copied ? '已复制' : '复制提示词'}
                    </button>
                    <button
                      onClick={handleOpenPlatform}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl text-[13px] font-medium hover:bg-black transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      前往 {selectedPlatform.name}
                    </button>
                  </div>
                  <button
                    onClick={() => setStep('paste')}
                    className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 py-1"
                  >
                    已有回答，直接粘贴 →
                  </button>
                </div>
              )}

              {/* Step 3: 粘贴内容 */}
              {step === 'paste' && (
                <div className="mt-2 space-y-3">
                  <textarea
                    value={pasteContent}
                    onChange={e => setPasteContent(e.target.value)}
                    placeholder={`将 ${selectedPlatform?.name ?? 'AI'} 的回答粘贴到这里…`}
                    className="w-full h-44 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[13px] resize-none outline-none focus:border-gray-400 transition-colors"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!pasteContent.trim() || isSaving}
                    className="w-full py-3 bg-violet-600 text-white rounded-xl font-semibold text-[14px] hover:bg-violet-700 disabled:opacity-40 transition-colors"
                  >
                    {isSaving ? '正在提取记忆节点…' : '保存为记忆节点'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
