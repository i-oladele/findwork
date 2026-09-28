import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthMethod = 'phone' | 'email'

/**
 * Phone is the default way in: it is how most people here expect to sign up.
 * Codes are texted by the send-sms function (Termii), and only to countries
 * it is set up for. When phone sign-in is switched off, or the number is from
 * another country, the screens move the person to email rather than leaving
 * them at an error.
 */
export function phoneUnavailable(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: string; message?: string }
  return (
    code === 'phone_provider_disabled' ||
    /phone signups are disabled|unsupported phone provider|sms_country_not_supported/i.test(message ?? '')
  )
}

/**
 * With email confirmation on, signing up with an address that already has an
 * account returns a user with no identities and sends nothing: Supabase will
 * not say which addresses are registered. Without this check the app would
 * wait for a code that never comes.
 */
export function signUpOutcome(data: { user: { identities?: unknown[] } | null; session: unknown }) {
  if (data.user && data.user.identities?.length === 0) {
    throw Object.assign(new Error('User already registered'), { code: 'user_already_exists' })
  }
  // With confirmation switched off, sign-up signs the user straight in.
  return { needsVerification: !data.session }
}

export type AuthContextValue = {
  session: Session | null
  user: User | null
  /** True until the initial session lookup finishes. Guards render on nothing. */
  loading: boolean
  signUp: (input: {
    method: AuthMethod
    phone?: string
    email?: string
    password: string
    firstName: string
    lastName: string
  }) => Promise<{ needsVerification: boolean }>
  signIn: (input: { method: AuthMethod; phone?: string; email?: string; password: string }) => Promise<void>
  /** Confirms the 6-digit code Supabase sent by SMS or email. */
  verifyOtp: (input: { method: AuthMethod; phone?: string; email?: string; token: string }) => Promise<void>
  resendOtp: (input: { method: AuthMethod; phone?: string; email?: string }) => Promise<void>
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>
  /** Fingerprint or face sign-in with a passkey saved on this device. See lib/passkeys.ts. */
  signInWithPasskey: () => Promise<void>
  /** Saves a passkey for the signed-in account, so the next sign-in can use the fingerprint. */
  registerPasskey: () => Promise<void>
  signOut: () => Promise<void>
  /**
   * Email: sends a link that lands on /reset-password already signed in.
   * Phone: sends a one-time code; confirming it with verifyOtp signs the
   * user in, after which they set a new password.
   */
  requestPasswordReset: (input: { method: AuthMethod; phone?: string; email?: string }) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
