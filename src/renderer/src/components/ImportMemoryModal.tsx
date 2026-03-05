import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, ExternalLink, Copy, Check } from 'lucide-react'
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
  color: string
  textColor: string
}

const PLATFORMS: Platform[] = [
  { id: 'chatgpt', name: 'ChatGPT', color: 'bg-gray-900',   textColor: 'text-white' },
  { id: 'claude',  name: 'Claude',  color: 'bg-gray-700',   textColor: 'text-white' },
  { id: 'gemini',  name: 'Gemini',  color: 'bg-gray-500',   textColor: 'text-white' }
]

type Step = 'select' | 'confirm' | 'paste' | 'generic'

export function ImportMemoryModal() {
  const activeCapabilityId = useCanvasStore(state => state.activeCapabilityId)
  const closeCapability = useCanvasStore(state => state.closeCapability)
  const saveMemoryImport = useCanvasStore(state => state.saveMemoryImport)

  const [step, setStep] = useState<Step>('select')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [pasteContent, setPasteContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const isOpen = activeCapabilityId !== null && activeCapabilityId.includes('import-memory')

  const genericPrompt = IMPORT_MEMORY_PROMPTS.generic

  /** 复制通用 prompt */
  const handleCopyGeneric = useCallback(async () => {
    await navigator.clipboard.writeText(genericPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [genericPrompt])

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
    setCopied(false)
    closeCapability()
  }, [closeCapability])

  const goBack = useCallback(() => {
    if (step === 'generic') { setStep('select'); setPasteContent(''); return }
    setStep('select')
    setSelectedPlatform(null)
    setPasteContent('')
  }, [step])

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
                {(step !== 'select') && (
                  <button
                    onClick={goBack}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors mr-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <div className="text-[15px] font-bold text-gray-900">导入外部记忆</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {step === 'select' && '从其他 AI 把你的记忆带过来'}
                    {step === 'confirm' && '已复制提示词，跳转后直接粘贴发送，再粘回来'}
                    {step === 'paste' && `把 ${selectedPlatform?.name ?? 'AI'} 的回答粘贴到下方`}
                    {step === 'generic' && '复制下方提示词，去你常用的 AI 发送，把回答粘贴回来'}
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
                <div className="space-y-3 mt-2">
                  <div className="grid grid-cols-3 gap-3">
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
                  {/* 通用方案入口 */}
                  <button
                    onClick={() => setStep('generic')}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all text-left"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-gray-700">其他 AI / 通用方式</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">复制提示词，粘贴回答</div>
                    </div>
                    <Copy className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                </div>
              )}

              {/* Gemini 确认跳转：已复制，提示后点「确认跳转」 */}
              {step === 'confirm' && selectedPlatform?.id === 'gemini' && (
                <div className="mt-2 space-y-4">
                  <p className="text-[14px] text-gray-700 leading-relaxed">
                    提示词已复制，跳转之后直接粘贴发送，把回答复制回来。
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

              {/* Step paste: 粘贴平台 AI 内容 */}
              {step === 'paste' && selectedPlatform && (
                <div className="mt-2 space-y-3">
                  <textarea
                    value={pasteContent}
                    onChange={e => setPasteContent(e.target.value)}
                    placeholder={`把 ${selectedPlatform.name} 的回答粘贴到这里…`}
                    className="w-full h-44 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[13px] resize-none outline-none focus:border-gray-400 transition-colors"
                    autoFocus
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

              {/* Step generic: 通用方案 */}
              {step === 'generic' && (
                <div className="mt-2 space-y-3">
                  {/* 可复制的 prompt */}
                  <div className="relative">
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {genericPrompt}
                    </div>
                    <button
                      onClick={handleCopyGeneric}
                      className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    把上面的提示词发给你常用的 AI（如豆包、文心、通义等），再把回答粘贴到下方。
                  </p>
                  <textarea
                    value={pasteContent}
                    onChange={e => setPasteContent(e.target.value)}
                    placeholder="把 AI 的回答粘贴到这里…"
                    className="w-full h-36 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[13px] resize-none outline-none focus:border-gray-400 transition-colors"
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
