/**
 * Language Context — 轻量多语言系统
 *
 * 用法：
 *   const { t, lang, setLang } = useT()
 *   t.canvas.zoomIn          // → "放大" | "Zoom in"
 *   t.input.hint             // → "Enter 发送 · Shift+Enter 换行" | "Enter to send…"
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { zh } from './zh'
import { en } from './en'
import type { Translations } from './zh'

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'anima_lang'

const translations: Record<Lang, Translations> = { zh, en }

interface LangContextValue {
  t: Translations
  lang: Lang
  setLang: (l: Lang) => void
}

const LangContext = createContext<LangContextValue>({
  t: zh,
  lang: 'zh',
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
    // 浏览器语言自动检测
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)

  return (
    <LangContext.Provider value={{ t: translations[lang], lang, setLang }}>
      {children}
    </LangContext.Provider>
  )
}

export function useT() {
  return useContext(LangContext)
}
