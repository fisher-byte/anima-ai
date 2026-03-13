import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, X, Save, Shield, Cpu, Link, Copy, Check, Key, Languages, Download } from 'lucide-react'
import { API_CONFIG, AI_CONFIG, SUPPORTED_MODELS } from '@shared/constants'
import { configService, storageService, isElectronEnvironment } from '../services/storageService'
import { getAuthToken, setAuthToken } from '../services/storageService'
import { USER_TOKEN_KEY } from '../App'
import { useT } from '../i18n'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, lang, setLang } = useT()
  const [apiKey, setApiKey] = useState('')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(API_CONFIG.BASE_URL)
  const [model, setModel] = useState<string>(AI_CONFIG.MODEL)
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  // 身份码相关
  const currentToken = localStorage.getItem(USER_TOKEN_KEY) ?? ''
  const [copied, setCopied] = useState(false)
  const [migrateInput, setMigrateInput] = useState('')
  const [showMigrate, setShowMigrate] = useState(false)

  const handleCopyToken = useCallback(() => {
    navigator.clipboard.writeText(currentToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [currentToken])

  const handleMigrateToken = useCallback(() => {
    const t = migrateInput.trim()
    if (!t || t === currentToken) return
    localStorage.setItem(USER_TOKEN_KEY, t)
    setAuthToken(t)
    setMigrateInput('')
    setShowMigrate(false)
    // 重载页面让数据从新 token 的 db 加载
    window.location.reload()
  }, [migrateInput, currentToken])

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      setApiKey('')  // 每次打开重置，不回填旧密文
      const loadConfig = async () => {
        const savedKey = await configService.getApiKey()
        if (savedKey) {
          setHasExistingKey(true)
          // 不回填密文，让用户主动输入新 key 才覆盖
        } else {
          setHasExistingKey(false)
        }

        // Web mode: load model/baseUrl from config service (backend DB)
        // Electron mode: falls back to settings.json via storageService
        const backendSettings = await configService.getSettings()
        const isElectron = isElectronEnvironment()
        if (backendSettings.model) {
          setModel(backendSettings.model)
        } else if (isElectron) {
          const settingsJson = await storageService.read('settings.json')
          if (settingsJson) {
            const settings = JSON.parse(settingsJson)
            if (settings.model) setModel(settings.model)
          }
        }
        if (backendSettings.baseUrl) {
          setBaseUrl(backendSettings.baseUrl)
        } else if (isElectron) {
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
    setKeyError('')
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
      ;(AI_CONFIG as { MODEL: string }).MODEL = model

      // 校验 API Key：调后端验证接口
      if (apiKey) {
        try {
          const token = getAuthToken()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers['Authorization'] = `Bearer ${token}`
          const verifyRes = await fetch('/api/config/verify-key', {
            method: 'POST',
            headers,
            body: JSON.stringify({ apiKey, baseUrl }),
            signal: AbortSignal.timeout(8000)
          })
          const result = await verifyRes.json()
          if (!result.valid) {
            setKeyError(t.input.invalidKey)
          }
        } catch {
          // 网络超时等，不阻止保存，静默跳过
        }
      }

      setShowSuccess(true)
      setShowError(false)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setShowError(true)
      setTimeout(() => setShowError(false), 3000)
    } finally {
      setIsSaving(false)
    }
  }, [apiKey, baseUrl, model])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/storage/export', { headers })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anima-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently ignore
    } finally {
      setIsExporting(false)
    }
  }, [])

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
              <h2 className="font-semibold text-lg">{t.settings.title}</h2>
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
            {/* 身份码 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Key className="w-3.5 h-3.5" />
                {t.settings.identityCode}
              </label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                <span className="flex-1 text-xs text-gray-500 font-mono truncate select-all">{currentToken}</span>
                <button
                  onClick={handleCopyToken}
                  className="shrink-0 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t.settings.copied : t.settings.copy}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 px-1">{t.settings.identityHelper}</p>
              <button
                onClick={() => setShowMigrate(v => !v)}
                className="text-[11px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
              >
                {showMigrate ? t.settings.cancelMigration : t.settings.migratePrompt}
              </button>
              <AnimatePresence>
                {showMigrate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <input
                      type="text"
                      value={migrateInput}
                      onChange={e => setMigrateInput(e.target.value)}
                      placeholder={t.settings.identityCodePlaceholder}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
                    />
                    <button
                      onClick={handleMigrateToken}
                      disabled={!migrateInput.trim() || migrateInput.trim() === currentToken}
                      className="w-full py-2.5 bg-gray-900 text-white text-xs font-medium rounded-2xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {t.settings.migrateBtn}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-gray-100" />
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5" />
                {t.settings.apiKeyLabel}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasExistingKey ? t.settings.apiKeySavedPlaceholder : t.settings.apiKeyDefaultPlaceholder}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 px-1">
                {hasExistingKey ? t.settings.apiKeySavedHelper : t.settings.apiKeySecureHelper}
              </p>
              {keyError && (
                <p className="text-[11px] text-red-500 font-medium px-1">{keyError}</p>
              )}
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Link className="w-3.5 h-3.5" />
                {t.settings.baseUrlLabel}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t.settings.baseUrlPlaceholder}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all"
              />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Cpu className="w-3.5 h-3.5" />
                {t.settings.modelLabel}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
              >
                <optgroup label={t.settings.kimiGroup}>
                  {Object.entries(SUPPORTED_MODELS.KIMI).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label={t.settings.openaiGroup}>
                  {Object.entries(SUPPORTED_MODELS.OPENAI).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Languages className="w-3.5 h-3.5" />
                {t.settings.language}
              </label>
              <div className="flex gap-2">
                {(['zh', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all border ${
                      lang === l
                        ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-200 hover:text-gray-700'
                    }`}
                  >
                    {l === 'zh' ? '中文' : 'English'}
                  </button>
                ))}
              </div>
            </div>

            {/* 数据导出 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <Download className="w-3.5 h-3.5" />
                {t.settings.exportDataLabel}
              </label>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-50 border border-gray-100 text-gray-600 rounded-2xl text-sm hover:bg-gray-100 hover:border-gray-200 disabled:opacity-50 transition-all"
              >
                <Download className="w-4 h-4" />
                {isExporting ? t.settings.exporting : t.settings.exportDataBtn}
              </button>
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
                    {t.settings.saveSuccess}
                  </motion.span>
                )}
                {!showSuccess && showError && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-red-500 font-medium flex items-center gap-1.5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {t.settings.saveError}
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
              {isSaving ? t.settings.saving : t.settings.saveBtn}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
