import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from './database.types'
import { usePreferences } from './api/preferences'
import { fill, I18nContext, LANGUAGES, STORAGE_KEY, type Catalog, type I18n } from './i18n'

/** Loads the catalog for the language in use and provides t() to the app (see i18n.ts). */
const loaders: Record<Exclude<Language, 'en'>, () => Promise<{ default: Catalog }>> = {
  pcm: () => import('../locales/pcm.json'),
  yo: () => import('../locales/yo.json'),
  ig: () => import('../locales/ig.json'),
  ha: () => import('../locales/ha.json'),
}

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(value as Language) ? (value as Language) : null
  } catch {
    return null
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const prefs = usePreferences()
  const [chosen, setChosen] = useState<Language | null>(storedLanguage)
  const [catalog, setCatalog] = useState<{ language: Language; strings: Catalog }>({ language: 'en', strings: {} })
  const language: Language = chosen ?? prefs.data?.language ?? 'en'

  useEffect(() => {
    document.documentElement.lang = language
    if (language === 'en') return
    let cancelled = false
    loaders[language]().then((module) => { if (!cancelled) setCatalog({ language, strings: module.default }) }).catch(() => {})
    return () => { cancelled = true }
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* the choice still holds for this visit */ }
    setChosen(next)
  }, [])

  const value = useMemo<I18n>(() => {
    const strings = catalog.language === language ? catalog.strings : {}
    return { language, setLanguage, t: (text, vars) => fill(strings[text] ?? text, vars) }
  }, [language, catalog, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

