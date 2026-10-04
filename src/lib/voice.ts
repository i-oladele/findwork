import type { Language } from './database.types'

/**
 * Speaking to the app and having it speak back, using the browser's own
 * speech engines. Recognition exists in Chrome, Edge and Safari; where it
 * does not, the microphone button is not shown and typing still works.
 */

type Recognition = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canListen = () => recognitionClass() !== null
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** What to ask the browser to listen for. Pidgin is heard as Nigerian English. */
export const SPEECH_LOCALE: Record<Language, string> = { en: 'en-NG', pcm: 'en-NG', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG' }

/** Listens for one phrase. Rejects with a message fit to show if nothing usable was heard. */
export function listen(language: Language): { result: Promise<string>; stop: () => void } {
  const Ctor = recognitionClass()
  if (!Ctor) return { result: Promise.reject(new Error('This browser cannot listen. Type instead.')), stop: () => undefined }
  const recognition = new Ctor()
  recognition.lang = SPEECH_LOCALE[language]
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  const result = new Promise<string>((resolve, reject) => {
    let heard = ''
    recognition.onresult = (event) => { heard = event.results[0][0].transcript }
    recognition.onerror = (event) => reject(new Error(
      event.error === 'not-allowed' ? 'Allow the microphone to speak to FindWork.'
        : event.error === 'language-not-supported' ? 'This browser cannot listen in that language. Type instead, or switch the assistant to English in Preferences.'
          : 'We did not catch that. Try again.'))
    recognition.onend = () => (heard.trim() ? resolve(heard.trim()) : reject(new Error('We did not catch that. Try again.')))
  })
  recognition.start()
  return { result, stop: () => recognition.stop() }
}

export function speak(text: string, language: Language) {
  if (!canSpeak() || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = SPEECH_LOCALE[language]
  window.speechSynthesis.speak(utterance)
}

export type Command = { route: string; query: string; reply: string }

// English and common Pidgin phrasings, checked on the device so the usual
// requests work with no assistant service at all. First match wins, so the
// more specific phrases come first.
const RULES: { pattern: RegExp; route: string; reply: string }[] = [
  { pattern: /\b(add|top ?up|fund|put) (money|cash|am)|\btop ?up\b/, route: '/wallet/add', reply: 'Opening add money.' },
  { pattern: /\bwithdraw|cash ?out\b/, route: '/wallet/withdraw', reply: 'Opening withdrawals.' },
  { pattern: /\b(send|transfer) (money|cash)\b/, route: '/wallet/transfer', reply: 'Opening send money.' },
  { pattern: /\b(wallet|balance|my money)\b/, route: '/wallet', reply: 'Opening your wallet.' },
  { pattern: /\b(track|where (is|dey)|my) (my )?(order|delivery|package)|\borders?\b/, route: '/orders', reply: 'Opening your orders.' },
  { pattern: /\bpost (a )?job|\bi (get|have) (a )?job\b/, route: '/post-job', reply: 'Opening post a job.' },
  { pattern: /\b(my )?bookings?\b/, route: '/bookings', reply: 'Opening your bookings.' },
  { pattern: /\b(messages?|chats?|inbox)\b/, route: '/messages', reply: 'Opening your messages.' },
  { pattern: /\bnotifications?\b/, route: '/notifications', reply: 'Opening notifications.' },
  { pattern: /\b(cart|basket)\b/, route: '/cart', reply: 'Opening your cart.' },
  { pattern: /\b(shop|buy|market)\b/, route: '/shop', reply: 'Opening the shop.' },
  { pattern: /\b(courses?|learn|certificate)\b/, route: '/courses', reply: 'Opening courses.' },
  { pattern: /\binternships?\b/, route: '/internships', reply: 'Opening internships.' },
  { pattern: /\b(classifieds?|rent|used|second ?hand|tokunbo)\b/, route: '/classifieds', reply: 'Opening classifieds.' },
  { pattern: /\b(sos|emergency|i need help now)\b/, route: '/meetups', reply: 'Opening the SOS screen.' },
  { pattern: /\b(verify|verification)\b/, route: '/get-verified', reply: 'Opening verification.' },
  { pattern: /\b(help|support|complain)\b/, route: '/help', reply: 'Opening help.' },
  { pattern: /\b(settings?|profile|account)\b/, route: '/settings', reply: 'Opening settings.' },
  { pattern: /\b(home|go back home)\b/, route: '/home', reply: 'Going home.' },
]

const FIND = /\b(?:find|i need|i want|i wan|get me|look ?for|search(?: for)?|book|hire)\s+(?:me\s+)?(?:an?\s+|one\s+|some\s+|the\s+)?(.{2,60})$/

/** A command understood on the device, or null if it needs the assistant. */
export function parseCommand(said: string): Command | null {
  const text = said.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const rule = RULES.find((r) => r.pattern.test(text))
  if (rule) return { route: rule.route, query: '', reply: rule.reply }
  const wanted = FIND.exec(text)?.[1]?.trim()
  if (wanted) return { route: '/search', query: wanted, reply: `Looking for ${wanted}.` }
  return null
}

/** Voice onboarding: which of the four ways in someone asked for. */
export function parseRole(said: string): '/home' | '/work-profile' | '/rider' | '/procurement' | null {
  const text = said.toLowerCase()
  if (/\b(deliver|rider|dispatch|okada)\b/.test(text)) return '/rider'
  if (/\b(business|company|bulk|wholesale|procure)\b/.test(text)) return '/procurement'
  if (/\b(work|sell|job|artisan|provider|earn)\b/.test(text)) return '/work-profile'
  if (/\b(hire|buy|shop|customer|find)\b/.test(text)) return '/home'
  return null
}
