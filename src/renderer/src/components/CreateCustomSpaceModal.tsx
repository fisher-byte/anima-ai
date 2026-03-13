/**
 * CreateCustomSpaceModal — 创建自定义 Space 的弹窗
 *
 * 字段：name / topic / colorKey / systemPrompt / avatarInitials
 * 调用 canvasStore.createCustomSpace，成功后关闭
 */
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useCanvasStore } from '../stores/canvasStore'
import { buildCustomSpacePrompt } from '@shared/constants'
import { useT } from '../i18n'
import type { SpaceColorKey } from '@shared/types'

const COLOR_OPTIONS: { key: SpaceColorKey; bg: string; ring: string; label: string }[] = [
  { key: 'indigo',  bg: 'bg-indigo-500',  ring: 'ring-indigo-400',  label: 'Indigo' },
  { key: 'violet',  bg: 'bg-violet-500',  ring: 'ring-violet-400',  label: 'Violet' },
  { key: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-400', label: 'Emerald' },
  { key: 'amber',   bg: 'bg-amber-500',   ring: 'ring-amber-400',   label: 'Amber' },
  { key: 'rose',    bg: 'bg-rose-500',    ring: 'ring-rose-400',    label: 'Rose' },
  { key: 'sky',     bg: 'bg-sky-500',     ring: 'ring-sky-400',     label: 'Sky' },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateCustomSpaceModal({ isOpen, onClose, onCreated }: Props) {
  const { t } = useT()
  const createCustomSpace = useCanvasStore(state => state.createCustomSpace)

  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [colorKey, setColorKey] = useState<SpaceColorKey>('indigo')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [avatarInitials, setAvatarInitials] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setName('')
    setTopic('')
    setColorKey('indigo')
    setSystemPrompt('')
    setAvatarInitials('')
    setError(null)
    setIsCreating(false)
  }, [])

  const handleClose = useCallback(() => {
    if (isCreating) return
    resetForm()
    onClose()
  }, [isCreating, resetForm, onClose])

  const handleCreate = useCallback(async () => {
    if (!name.trim()) { setError(t.space.createSpaceNameRequired); return }
    setIsCreating(true)
    setError(null)
    try {
      const finalPrompt = systemPrompt.trim() || buildCustomSpacePrompt(name.trim(), topic.trim())
      const initials = avatarInitials.trim().slice(0, 2) || name.trim().slice(0, 2).toUpperCase()
      await createCustomSpace({
        name: name.trim(),
        topic: topic.trim(),
        colorKey,
        systemPrompt: finalPrompt,
        avatarInitials: initials,
      })
      resetForm()
      onCreated?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsCreating(false)
    }
  }, [name, topic, colorKey, systemPrompt, avatarInitials, createCustomSpace, resetForm, onCreated, onClose, t])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 pointer-events-auto overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">{t.space.createSpaceTitle}</h2>
                <button
                  onClick={handleClose}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">

                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.space.createSpaceName}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t.space.createSpaceNamePlaceholder}
                    maxLength={40}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all placeholder:text-gray-400"
                  />
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.space.createSpaceTopic}</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder={t.space.createSpaceTopicPlaceholder}
                    maxLength={80}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all placeholder:text-gray-400"
                  />
                </div>

                {/* Avatar Initials */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.space.createSpaceAvatar}</label>
                  <input
                    type="text"
                    value={avatarInitials}
                    onChange={e => setAvatarInitials(e.target.value.slice(0, 2))}
                    placeholder={t.space.createSpaceAvatarPlaceholder}
                    maxLength={2}
                    className="w-24 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all placeholder:text-gray-400 uppercase"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">{t.space.createSpaceColor}</label>
                  <div className="flex gap-2">
                    {COLOR_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setColorKey(opt.key)}
                        title={opt.label}
                        className={`w-7 h-7 rounded-full transition-all ${opt.bg} ${colorKey === opt.key ? `ring-2 ring-offset-2 ${opt.ring} scale-110` : 'opacity-60 hover:opacity-90'}`}
                      />
                    ))}
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t.space.createSpacePrompt}
                    <span className="ml-1 text-gray-400 font-normal text-[10px]">(optional)</span>
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    placeholder={t.space.createSpacePromptPlaceholder}
                    rows={4}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all placeholder:text-gray-400 resize-none"
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-xs text-red-500">{error}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={handleClose}
                  disabled={isCreating}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-40"
                >
                  {t.space.createSpaceCancel}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !name.trim()}
                  className="px-5 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCreating ? t.space.createSpaceCreating : t.space.createSpaceCreate}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
