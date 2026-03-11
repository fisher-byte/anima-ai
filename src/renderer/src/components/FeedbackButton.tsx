import { useState, useRef } from 'react'
import { MessageSquareWarning, X, Bug, Lightbulb, ImagePlus } from 'lucide-react'
import { useT } from '../i18n'
import { getAuthToken } from '../services/storageService'
import { useCanvasStore } from '../stores/canvasStore'

const API_BASE = '/api'

export function FeedbackButton() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'bug' | 'feedback'>('feedback')
  const [message, setMessage] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nodes = useCanvasStore(s => s.nodes)
  const lastConvId = nodes[nodes.length - 1]?.conversationId ?? null

  function buildContext() {
    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      lastConvId,
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      // result is "data:image/png;base64,xxx..."
      const match = result.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        setImageMime(match[1])
        setImageData(match[2])
        setImagePreview(result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!message.trim()) return
    setStatus('submitting')
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type,
          message: message.trim(),
          context: buildContext(),
          imageData: imageData ?? undefined,
          imageMime: imageMime ?? undefined,
        }),
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setStatus('done')
      setTimeout(() => {
        setOpen(false)
        setStatus('idle')
        setMessage('')
        setImageData(null)
        setImageMime(null)
        setImagePreview(null)
      }, 2000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={t.feedback.title}
        className="fixed bottom-[52px] right-6 z-50 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all"
      >
        <MessageSquareWarning size={16} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-[96px] right-6 z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-800">{t.feedback.title}</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setType('bug')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  type === 'bug'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Bug size={12} />
                {t.feedback.typeBug}
              </button>
              <button
                onClick={() => setType('feedback')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  type === 'feedback'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Lightbulb size={12} />
                {t.feedback.typeSuggestion}
              </button>
            </div>

            {/* Textarea */}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t.feedback.placeholder}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder-gray-400"
            />

            {/* Image upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="preview" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => { setImageData(null); setImageMime(null); setImagePreview(null) }}
                    className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-gray-700"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <ImagePlus size={14} />
                  {t.feedback.uploadImage}
                </button>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!message.trim() || status === 'submitting' || status === 'done'}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
            >
              {status === 'submitting'
                ? t.feedback.submitting
                : status === 'done'
                ? t.feedback.thanks
                : status === 'error'
                ? t.feedback.error
                : t.feedback.submit}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
