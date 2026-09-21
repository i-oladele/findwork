import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthMethod = 'phone' | 'email'

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
    fullName: string
  }) => Promise<{ needsVerification: boolean }>
  signIn: (input: { method: AuthMethod; phone?: string; email?: string; password: string }) => Promise<void>
  /** Confirms the 6-digit code Supabase sent by SMS or email. */
  verifyOtp: (input: { method: AuthMethod; phone?: string; email?: string; token: string }) => Promise<void>
  resendOtp: (input: { method: AuthMethod; phone?: string; email?: string }) => Promise<void>
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>
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
