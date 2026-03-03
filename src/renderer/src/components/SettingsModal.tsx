import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, X, Save, Shield, Cpu, Link } from 'lucide-react'
import { API_CONFIG, AI_CONFIG, SUPPORTED_MODELS } from '@shared/constants'
import { configService, storageService } from '../services/storageService'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(API_CONFIG.BASE_URL)
  const [model, setModel] = useState<string>(AI_CONFIG.MODEL)
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      const loadConfig = async () => {
        const savedKey = await configService.getApiKey()
        if (savedKey) setApiKey(savedKey)

        // Web mode: load model/baseUrl from config service (backend DB)
        // Electron mode: falls back to settings.json via storageService
        const backendSettings = await configService.getSettings()
        if (backendSettings.model) {
          setModel(backendSettings.model)
        } else {
          const settingsJson = await storageService.read('settings.json')
          if (settingsJson) {
            const settings = JSON.parse(settingsJson)
            if (settings.model) setModel(settings.model)
          }
        }
        if (backendSettings.baseUrl) {
          setBaseUrl(backendSettings.baseUrl)
        } else {
          const settingsJson = await storageService.read('settings.json')
          if (settingsJson) {
            const settings = JSON.parse(settingsJson)
            if (settings.baseUrl) setBaseUrl(settings.baseUrl)
          }
        }
      }
      loadConfig()
    }
  }, [isOpen])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      // 保存 API Key 到安全存储
      await configService.setApiKey(apiKey)

      // Save model/baseUrl to config service (backend DB in web mode)
      await configService.saveSettings({ baseUrl, model })

      // Also keep settings.json for Electron mode compatibility
      const settings = { baseUrl, model }
      await storageService.write('settings.json', JSON.stringify(settings, null, 2))
      
      // 更新内存中的配置（简易处理，实际应用可能需要更复杂的同步）
      API_CONFIG.BASE_URL = baseUrl
      // @ts-ignore
      AI_CONFIG.MODEL = model
      
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setIsSaving(false)
    }
  }, [apiKey, baseUrl, model])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        {/* 遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* 弹窗 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* 头部 */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-800">
              <div className="p-2 bg-gray-100 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-lg">应用设置</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            {/* API Key */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5" />
                API Key (安全存储)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 px-1">
                你的密钥加密保存在服务端数据库，不会暴露给浏览器。
              </p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Link className="w-3.5 h-3.5" />
                API 代理地址 (可选)
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.moonshot.cn/v1"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
              />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Cpu className="w-3.5 h-3.5" />
                当前模型
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
              >
                <optgroup label="Kimi (Moonshot)">
                  {Object.entries(SUPPORTED_MODELS.KIMI).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label="OpenAI">
                  {Object.entries(SUPPORTED_MODELS.OPENAI).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex-1">
              <AnimatePresence>
                {showSuccess && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-green-600 font-medium flex items-center gap-1.5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    保存成功
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
