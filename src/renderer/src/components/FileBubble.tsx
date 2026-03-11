import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { File as FileIcon, Download, AlertCircle } from 'lucide-react'
import type { FileAttachment } from '@shared/types'
import { useT } from '../i18n'

interface FileBubbleProps {
  file: FileAttachment
}

/**
 * 文件气泡组件
 * 默认为紧凑胶囊，点击后展开显示详情 + 下载链接，
 * 视觉上作为"小卫星"环绕对话气泡存在。
 */
export function FileBubble({ file }: FileBubbleProps) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const sizeKB = (file.size / 1024).toFixed(1)

  return (
    <motion.div
      layout
      onClick={() => setExpanded(v => !v)}
      whileHover={{ scale: 1.02, y: -1 }}
      className={`
        cursor-pointer rounded-2xl border bg-white shadow-sm select-none
        transition-all duration-200
        ${expanded
          ? 'border-gray-200 shadow-md p-3 w-52'
          : 'border-gray-100 px-3 py-1.5 hover:border-gray-200 hover:shadow'}
      `}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FileIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className={`text-[11px] font-medium text-gray-600 ${expanded ? '' : 'truncate max-w-[120px]'}`}>
          {file.name}
        </span>
        {file.uploadError && !expanded && (
          <span title={file.uploadError}>
            <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          </span>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
              <div className="text-[10px] text-gray-400">{t.fileBubble.size}{sizeKB} KB</div>
              <div className="text-[10px] text-gray-400 truncate">
                {t.fileBubble.type}{file.type || t.fileBubble.unknown}
              </div>
              {file.uploadError && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {file.uploadError}
                </div>
              )}
              {file.content && (
                <div className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">
                  {file.content.slice(0, 60)}…
                </div>
              )}
              {!file.uploadError && (
                <a
                  href={`/api/storage/file/${file.id}`}
                  download={file.name}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 mt-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                >
                  <Download className="w-3 h-3" />
                  {t.fileBubble.download}
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
