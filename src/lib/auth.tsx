import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext } from './authContext'
import { queryClient } from './queryClient'
import { useCart } from '../store/cart'
import type { AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        // Cached wallet, bookings and cart belong to whoever just left; on a
        // shared phone the next person must not see them, even for a frame.
        queryClient.clear()
        useCart.getState().clear()
      }
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,

      async signUp({ method, phone, email, password, fullName }) {
        // full_name rides along in metadata so the handle_new_user trigger
        // (migration 1) can populate profiles in the same transaction.
        const credentials =
          method === 'phone'
            ? { phone: phone!, password, options: { data: { full_name: fullName, phone: phone! } } }
            : { email: email!, password, options: { data: { full_name: fullName } } }

        const { data, error } = await supabase.auth.signUp(credentials)
        if (error) throw error
        // With confirmation switched off in the project, sign-up signs the
        // user straight in and no code is ever sent.
        return { needsVerification: !data.session }
      },

      async signIn({ method, phone, email, password }) {
        const credentials =
          method === 'phone' ? { phone: phone!, password } : { email: email!, password }
        const { error } = await supabase.auth.signInWithPassword(credentials)
        if (error) throw error
      },

      async verifyOtp({ method, phone, email, token }) {
        const params =
          method === 'phone'
            ? ({ phone: phone!, token, type: 'sms' } as const)
            : ({ email: email!, token, type: 'email' } as const)
        const { error } = await supabase.auth.verifyOtp(params)
        if (error) throw error
      },

      async resendOtp({ method, phone, email }) {
        const { error } = await supabase.auth.resend(
          method === 'phone'
            ? { type: 'sms', phone: phone! }
            : { type: 'signup', email: email! },
        )
        if (error) throw error
      },

      async signInWithOAuth(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/home` },
        })
        if (error) throw error
      },

      async signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },

      async requestPasswordReset({ method, phone, email }) {
        const { error } =
          method === 'phone'
            ? await supabase.auth.signInWithOtp({ phone: phone!, options: { shouldCreateUser: false } })
            : await supabase.auth.resetPasswordForEmail(email!, {
                redirectTo: `${window.location.origin}/reset-password`,
              })
        if (error) throw error
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
