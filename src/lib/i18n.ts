import { createContext, useContext } from 'react'
import type { Language } from './database.types'

/**
 * The app's own text in English, Nigerian Pidgin, Yoruba, Igbo and Hausa.
 *
 * The English sentence is the key: t("Wallet") shows the Yoruba for it,
 * and anything not yet translated shows in English rather than breaking.
 * Catalogs are loaded only for the language in use. Placeholders in braces
 * are filled from the second argument: t("Balance {amount}", { amount }).
 *
 * The language follows the choice made on this device (Welcome, Settings →
 * Preferences), then the signed-in account's saved preference, then English.
 * npm run i18n:check fails if a wrapped sentence is missing from a catalog.
 */

export type Vars = Record<string, string | number>
export type Translate = (text: string, vars?: Vars) => string
export type Catalog = Record<string, string>

export const STORAGE_KEY = 'findwork-language'
export const LANGUAGES: Language[] = ['en', 'pcm', 'yo', 'ig', 'ha']

export function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

export type I18n = { language: Language; t: Translate; setLanguage: (language: Language) => void }

// Outside the provider (tests, the error boundary) everything is English.
export const I18nContext = createContext<I18n>({ language: 'en', t: fill, setLanguage: () => {} })

export { msg } from './msg'

/** The translate function for the language in use. */
export function useT(): Translate {
  return useContext(I18nContext).t
}

export function useLanguage(): Pick<I18n, 'language' | 'setLanguage'> {
  const { language, setLanguage } = useContext(I18nContext)
  return { language, setLanguage }
}
