/**
 * FileBrowserPanel — 历史文件浏览侧面板
 *
 * 从右侧滑入，展示用户所有历史上传文件：
 * - 按上传时间倒序排列
 * - 显示文件名、类型、上传日期、向量化状态
 * - 点击「引用」将 @文件名 插入到输入框（通过事件或回调）
 */
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, FileCode, File as FileIcon, Image, Loader2, AtSign, RefreshCw } from 'lucide-react'
import { getAuthToken } from '../services/storageService'
import { useT } from '../i18n'

interface FileItem {
  id: string
  filename: string
  embed_status: string
  created_at: string
  size?: number
}

interface FileBrowserPanelProps {
  isOpen: boolean
  onClose: () => void
  onInsertMention?: (filename: string) => void
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return <Image className="w-4 h-4 text-purple-400 shrink-0" />
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'swift', 'rb', 'php', 'sh', 'sql'].includes(ext))
    return <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
  if (ext === 'pdf')
    return <FileText className="w-4 h-4 text-red-400 shrink-0" />
  if (['doc', 'docx', 'txt', 'md'].includes(ext))
    return <FileText className="w-4 h-4 text-gray-400 shrink-0" />
  return <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
}

export function FileBrowserPanel({ isOpen, onClose, onInsertMention }: FileBrowserPanelProps) {
  const { t } = useT()
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/storage/files', { headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json() as { files: FileItem[] }
      setFiles((data.files ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch {
      setError('Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) loadFiles()
  }, [isOpen, loadFiles])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="file-browser-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="file-browser-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">{t.canvas.fileLibrary}</h2>
                {files.length > 0 && (
                  <span className="text-[11px] text-gray-400 font-medium">{files.length}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadFiles}
                  disabled={loading}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading && files.length === 0 && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {error && (
                <div className="px-5 py-4 text-sm text-red-500">{error}</div>
              )}

              {!loading && !error && files.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 px-6 text-center">
                  <FileIcon className="w-8 h-8 opacity-30" />
                  <p className="text-sm">还没有上传过文件</p>
                  <p className="text-xs opacity-70">在输入框点击 📎 上传文件</p>
                </div>
              )}

              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-50 group"
                >
                  <div className="mt-0.5">{getFileIcon(file.filename)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-800 truncate leading-tight">{file.filename}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-400">
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                      {file.embed_status !== 'done' && (
                        <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          向量化中
                        </span>
                      )}
                      {file.embed_status === 'done' && (
                        <span className="text-[10px] text-emerald-500 font-medium">已索引</span>
                      )}
                    </div>
                  </div>
                  {onInsertMention && (
                    <button
                      onClick={() => onInsertMention(file.filename)}
                      className="opacity-0 group-hover:opacity-100 shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                      title="引用此文件"
                    >
                      <AtSign className="w-3 h-3" />
                      引用
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
