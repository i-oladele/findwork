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
  dispute_open: 'A dispute is open on this. The money stays on hold until our team resolves it.',
  listing_limit_reached: 'Your plan allows 3 live services. Pause one, or upgrade for unlimited listings.',
  '23P01': 'That time slot was just taken. Please pick another.',
  '23505': 'That already exists.',
  '23503': 'Something this depends on is missing. Please refresh and try again.',
  '42501': 'You do not have permission to do that.',
  'provider not found': 'This provider is no longer available.',
  'provider is not taking bookings': 'This provider is not taking bookings right now.',
  'provider is closed that day': 'This provider does not work on that day. Pick another.',
  'cannot book a time in the past': 'That time has already passed. Pick a later one.',
  'cannot book yourself': 'You cannot book your own services.',
  'package is paused': 'That service is paused by the provider.',
  'package not found': 'That service is no longer available.',
  'booking not found': 'We could not find that booking.',
  'not your booking': 'You do not have permission to change this booking.',
  'booking already answered': 'This booking has already been accepted or declined.',
  'booking already started': 'This booking has already started. If something is wrong, open a dispute.',
  'booking cannot be cancelled': 'This booking can no longer be cancelled.',
  'booking cannot be rescheduled': 'This booking can no longer be rescheduled.',
  'choose a different time': 'Choose a time different from the current booking.',
  'too far ahead': 'Choose a time within the next 90 days.',
  'reason too long': 'Keep your reason under 500 characters.',
  'reschedule already pending': 'There is already a proposed time. Respond to it or withdraw it first.',
  'reschedule already answered': 'This time change is no longer pending. Refresh to see the latest schedule.',
  'reschedule not found': 'We could not find that time change.',
  'only the other participant can respond': 'Only the other person can accept or decline your proposed time.',
  'booking is not active': 'The provider has not accepted this booking yet.',
  'booking is closed': 'This booking is already finished, so there is nothing to dispute.',
  'order already dispatched': 'This order is already on its way, so it cannot be cancelled.',
  'order is closed': 'This order is already closed.',
  'address required': 'Add a delivery address first.',
  'product not found': 'Something in your cart is no longer sold. Remove it and try again.',
  'invalid quantity': 'Quantities must be between 1 and 99.',
  'cart is empty': 'Your cart is empty.',
  'not your job': 'You do not have permission to change this job.',
  'job is closed': 'This job is closed.',
  'not your RFQ': 'You do not have permission to change this RFQ.',
  'RFQ is closed': 'This RFQ is closed.',
  'plan not found': 'That plan is no longer available.',
  'quote not found': 'We could not find that quote.',
  'not enrolled': 'Enrol in the course first.',
  'add a bank account first': 'Add the bank account to pay into first.',
  'minimum withdrawal': 'The minimum withdrawal is ₦1,000.',
  'cannot message yourself': 'That is you.',
  'admins only': 'Only FindWork staff can do that.',
  'reason required': 'Tell us what went wrong.',
  'Invalid login credentials': 'That email, phone or password is not right.',
  'User already registered': 'An account with those details already exists. Sign in instead.',

  // Supabase Auth error codes. Phone sign-in needs an SMS provider
  // (Twilio and friends) configured on the project, and costs money per
  // message, so it is off until someone switches it on.
  phone_provider_disabled: 'Phone sign-up is not switched on yet. Use your email address instead.',
  email_provider_disabled: 'Email sign-up is not switched on yet.',
  signup_disabled: 'New accounts are closed at the moment.',
  over_sms_send_rate_limit: 'Too many codes sent. Wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
  otp_expired: 'That code has expired. Ask for a new one.',
  invalid_credentials: 'That email, phone or password is not right.',
  user_already_exists: 'An account with those details already exists. Sign in instead.',
  email_not_confirmed: 'Confirm your email address first — check your inbox.',
  weak_password: 'Choose a stronger password: at least 8 characters, including a number.',
  // Supabase rejects throwaway domains such as example.com outright.
  email_address_invalid: 'That email address was not accepted. Use a real one you can open.',
  validation_failed: 'Check the details you entered and try again.',
  'Unsupported provider': 'That sign-in option is not available yet. Use your email address.',
  same_password: 'That is your current password. Choose a different one.',
  'Phone signups are disabled': 'Phone sign-up is not switched on yet. Use your email address instead.',
  'Signups not allowed': 'New accounts are closed at the moment.',
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
  // Errors raised in the app itself (validation, Edge Function messages)
  // are already written for the user.
  if (error instanceof Error && !(error as { code?: string }).code && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
