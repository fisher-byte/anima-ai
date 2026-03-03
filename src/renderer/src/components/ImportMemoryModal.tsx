import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ExternalLink } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { IMPORT_MEMORY_PROMPTS } from '@shared/constants'

/** ChatGPT/Claude 支持 URL 预填；Gemini 不支持，仅返回打开页的 URL */
function buildPrefillUrl(platformId: keyof typeof IMPORT_MEMORY_PROMPTS, prompt: string): string {
  const q = encodeURIComponent(prompt)
  switch (platformId) {
    case 'chatgpt':
      return `https://chatgpt.com/?q=${q}`
    case 'claude':
      return `https://claude.ai/new?q=${q}`
    case 'gemini':
      return 'https://gemini.google.com/app'
    default:
      return ''
  }
}

interface Platform {
  id: keyof typeof IMPORT_MEMORY_PROMPTS
  name: string
  url: string
  color: string
  textColor: string
}

const PLATFORMS: Platform[] = [
  { id: 'chatgpt',  name: 'ChatGPT',  url: 'https://chatgpt.com',         color: 'bg-gray-900',   textColor: 'text-white' },
  { id: 'claude',   name: 'Claude',   url: 'https://claude.ai',           color: 'bg-gray-700',   textColor: 'text-white' },
  { id: 'gemini',   name: 'Gemini',   url: 'https://gemini.google.com',   color: 'bg-gray-500',   textColor: 'text-white' }
]

type Step = 'select' | 'confirm' | 'paste'

export function ImportMemoryModal() {
  const activeCapabilityId = useCanvasStore(state => state.activeCapabilityId)
  const closeCapability = useCanvasStore(state => state.closeCapability)
  const saveMemoryImport = useCanvasStore(state => state.saveMemoryImport)

  const [step, setStep] = useState<Step>('select')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [pasteContent, setPasteContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isOpen = activeCapabilityId !== null && activeCapabilityId.includes('import-memory')

  /** ChatGPT/Claude 直接跳转并预填；Gemini 先复制并进入确认步，再点「确认跳转」才打开 */
  const handleGoToPlatform = useCallback(async (p: Platform) => {
    const prompt = IMPORT_MEMORY_PROMPTS[p.id]
    if (p.id === 'gemini') {
      await navigator.clipboard.writeText(prompt)
      setSelectedPlatform(p)
      setStep('confirm')
      return
    }
    window.open(buildPrefillUrl(p.id, prompt), '_blank')
    setSelectedPlatform(p)
    setStep('paste')
  }, [])

  /** Gemini 确认跳转：打开新标签后进入粘贴步 */
  const handleConfirmJumpToGemini = useCallback(() => {
    if (!selectedPlatform || selectedPlatform.id !== 'gemini') return
    window.open(buildPrefillUrl('gemini', IMPORT_MEMORY_PROMPTS.gemini), '_blank')
    setStep('paste')
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
                {(step === 'confirm' || step === 'paste') && (
                  <button
                    onClick={() => {
                      setStep('select')
                      if (step === 'confirm') setSelectedPlatform(null)
                      if (step === 'paste') {
                        setSelectedPlatform(null)
                        setPasteContent('')
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors mr-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <div className="text-[15px] font-bold text-gray-900">导入外部记忆</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {step === 'select' && '点击即跳转，提示词已预填或已复制，到对方页面直接粘贴后发送，再粘回下方即可'}
                    {step === 'confirm' && '复制好了，跳转后直接粘贴即可'}
                    {step === 'paste' && '将 AI 回答粘贴到下方'}
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
                      onClick={() => handleGoToPlatform(p)}
                      className={`flex flex-col items-center gap-2 py-5 rounded-2xl ${p.color} ${p.textColor} font-semibold text-[14px] hover:opacity-90 active:scale-95 transition-all shadow-sm`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Gemini 确认跳转：已复制，提示后点「确认跳转」 */}
              {step === 'confirm' && selectedPlatform?.id === 'gemini' && (
                <div className="mt-2 space-y-4">
                  <p className="text-[14px] text-gray-700 leading-relaxed">
                    我们已经帮你复制进去了，跳转之后直接粘贴就行了。
                  </p>
                  <button
                    onClick={handleConfirmJumpToGemini}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gray-700 text-white rounded-xl font-semibold text-[14px] hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    确认跳转到 Gemini
                  </button>
                </div>
              )}

              {/* Step 3: 粘贴内容 */}
              {step === 'paste' && selectedPlatform && (
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
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-[14px] hover:bg-black disabled:opacity-40 transition-colors"
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
