import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext, signUpOutcome } from './authContext'
import { queryClient } from './queryClient'
import { destination, forgetDestination, onboardingPath, rememberDestination, storedDestination } from './destination'
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
        forgetDestination()
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

      async signUp({ method, phone, email, password, firstName, lastName }) {
        // A new account picks a role first, then goes on to whatever link
        // brought them. Set before signing up: with confirmation off, the
        // session arrives mid-call and the sign-in guard redirects at once.
        const before = storedDestination()
        const next = onboardingPath(before)
        rememberDestination(next)

        // The names ride along in metadata so the handle_new_user trigger can
        // populate profiles in the same transaction. full_name too, for any
        // database that predates the separate name columns.
        const names = { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`.trim() }
        const credentials =
          method === 'phone'
            ? { phone: phone!, password, options: { data: { ...names, phone: phone! } } }
            : {
                email: email!,
                password,
                // The confirmation email's link lands back in onboarding.
                options: { data: names, emailRedirectTo: `${window.location.origin}${next}` },
              }

        try {
          const { data, error } = await supabase.auth.signUp(credentials)
          if (error) throw error
          return signUpOutcome(data)
        } catch (err) {
          rememberDestination(before)
          throw err
        }
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
            : { type: 'signup', email: email!, options: { emailRedirectTo: `${window.location.origin}${destination()}` } },
        )
        if (error) throw error
      },

      async signInWithOAuth(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}${destination()}` },
        })
        if (error) throw error
      },

      async signInWithPasskey() {
        // The phone offers the passkeys it holds for this site; no number or
        // email is needed first.
        const { error } = await supabase.auth.signInWithPasskey()
        if (error) throw error
      },

      async registerPasskey() {
        const { error } = await supabase.auth.registerPasskey()
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
