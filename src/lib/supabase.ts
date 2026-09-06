import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True when the app has been pointed at a Supabase project. Screens use this
 * to fail loudly in development instead of rendering empty states that look
 * like real "no data yet" results.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[findwork] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env.local and fill them in — every query will fail until you do.',
  )
}

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Postgres error codes and the RAISE EXCEPTION messages our RPCs use, mapped
 * to copy a user should actually see. Anything unrecognised falls through to
 * a generic message rather than leaking SQL to the screen.
 */
const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_balance: 'Not enough money in your wallet. Top up and try again.',
  '23P01': 'That time slot was just taken. Please pick another.',
  '23505': 'That already exists.',
  '23503': 'Something this depends on is missing. Please refresh and try again.',
  'provider not found': 'This provider is no longer available.',
  'booking not found': 'We could not find that booking.',
  'not your booking': 'You do not have permission to change this booking.',
  'not your request': 'You do not have permission to change this request.',
  'not your RFQ': 'You do not have permission to change this RFQ.',
  'plan not found': 'That plan is no longer available.',
  'quote not found': 'We could not find that quote.',
}

export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.'
  const err = error as { message?: string; code?: string }
  if (err.code && FRIENDLY_ERRORS[err.code]) return FRIENDLY_ERRORS[err.code]
  if (err.message) {
    for (const [needle, friendly] of Object.entries(FRIENDLY_ERRORS)) {
      if (err.message.includes(needle)) return friendly
    }
    if (err.message.includes('Failed to fetch')) {
      return 'No connection. Check your network and try again.'
    }
  }
  return 'Something went wrong. Please try again.'
}
