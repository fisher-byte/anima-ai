/**
 * GlobalUI — 全局 Toast + ConfirmDialog
 *
 * 使用方式：
 *   import { useToast }   from './GlobalUI'
 *   import { useConfirm } from './GlobalUI'
 *
 *   const toast   = useToast()
 *   const confirm = useConfirm()
 *
 *   toast.success('已保存')
 *   toast.error('出错了')
 *
 *   const ok = await confirm({ title: '删除对话', message: '此操作不可撤销' })
 *   if (ok) { ... }
 *
 * 挂载：在 App.tsx 里 <GlobalUI /> 即可。
 */

import { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, X } from 'lucide-react'

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────

interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastAPI {
  success: (msg: string) => void
  error:   (msg: string) => void
  info:    (msg: string) => void
}

const ToastContext = createContext<ToastAPI | null>(null)

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <GlobalUI>')
  return ctx
}

// ─────────────────────────────────────────────
// Confirm
// ─────────────────────────────────────────────

interface ConfirmOptions {
  title:    string
  message?: string
  confirmLabel?: string
  cancelLabel?:  string
  danger?: boolean
}

type ConfirmResolve = (ok: boolean) => void

interface ConfirmState {
  opts: ConfirmOptions
  resolve: ConfirmResolve
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <GlobalUI>')
  return ctx
}

// ─────────────────────────────────────────────
// GlobalUI provider + renderer
// ─────────────────────────────────────────────

export function GlobalUI({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  // 用 ref 追踪 setTimeout id，组件卸载时清理，防止内存泄漏
  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  useEffect(() => {
    return () => { timerRefs.current.forEach(clearTimeout) }
  }, [])

  // ── Toast API ──
  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, type, message }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timerRefs.current.delete(timer)
    }, 3000)
    timerRefs.current.add(timer)
  }, [])

  // useMemo 稳定引用，避免消费者因 toastAPI 对象重建而重渲染
  const toastAPI: ToastAPI = useMemo(() => ({
    success: (msg) => addToast('success', msg),
    error:   (msg) => addToast('error',   msg),
    info:    (msg) => addToast('info',    msg),
  }), [addToast])

  // ── Confirm API ──
  const confirmFn = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ opts, resolve })
    })
  }, [])

  const handleConfirmResult = useCallback((ok: boolean) => {
    confirmState?.resolve(ok)
    setConfirmState(null)
  }, [confirmState])

  return (
    <ToastContext.Provider value={toastAPI}>
      <ConfirmContext.Provider value={confirmFn}>
        {children}

        {/* ── Toast 堆叠层 ── */}
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map(t => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0,   scale: 1    }}
                exit={{    opacity: 0, y: -8,   scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={`
                  flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg
                  text-sm font-medium pointer-events-auto
                  ${t.type === 'success' ? 'bg-gray-900 text-white'
                  : t.type === 'error'   ? 'bg-red-500 text-white'
                  :                        'bg-white text-gray-800 border border-gray-100 shadow-md'}
                `}
              >
                {t.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                {t.type === 'error'   && <XCircle     className="w-4 h-4 flex-shrink-0" />}
                <span>{t.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ── Confirm Dialog ── */}
        <AnimatePresence>
          {confirmState && (
            <motion.div
              key="confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{    opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[190] flex items-center justify-center"
            >
              {/* 背景蒙层 */}
              <motion.div
                className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
                onClick={() => handleConfirmResult(false)}
              />

              {/* 卡片 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1,    y: 0  }}
                exit={{    opacity: 0, scale: 0.92, y: 8  }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* 关闭按钮 */}
                <button
                  onClick={() => handleConfirmResult(false)}
                  className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="px-7 pt-7 pb-6">
                  {/* 标题 */}
                  <p className="text-[15px] font-semibold text-gray-900 pr-6 leading-snug">
                    {confirmState.opts.title}
                  </p>

                  {/* 说明（可选）*/}
                  {confirmState.opts.message && (
                    <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                      {confirmState.opts.message}
                    </p>
                  )}

                  {/* 按钮区 */}
                  <div className="flex gap-2.5 mt-6">
                    <button
                      onClick={() => handleConfirmResult(false)}
                      className="flex-1 py-2.5 rounded-2xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {confirmState.opts.cancelLabel ?? '取消'}
                    </button>
                    <button
                      onClick={() => handleConfirmResult(true)}
                      className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${
                        confirmState.opts.danger
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-gray-900 text-white hover:bg-black'
                      }`}
                    >
                      {confirmState.opts.confirmLabel ?? '确定'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  )
}
