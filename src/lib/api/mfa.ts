import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'

/**
 * Whether this session still owes the second step. Read from the session
 * itself, so it costs no request and works before the API will answer.
 */
export function useAssurance() {
  const { session } = useAuth()
  return useQuery({
    queryKey: [...keys.security.all, 'assurance', session?.access_token ?? ''],
    enabled: Boolean(session),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) throw error
      return { needsChallenge: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2', verified: data.currentLevel === 'aal2' }
    },
  })
}

export function useMfaFactors() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.security.factors(),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data.totp
    },
  })
}

export type MfaEnrolment = { factorId: string; qr: string; secret: string }

/** Starts adding an authenticator app. Nothing is on until a code from it is confirmed. */
export function useStartMfaEnrolment() {
  return useMutation({
    mutationFn: async (): Promise<MfaEnrolment> => {
      // A setup abandoned half-way leaves an unconfirmed factor behind, and
      // Supabase refuses a second one with the same name.
      const existing = await supabase.auth.mfa.listFactors()
      if (existing.error) throw existing.error
      for (const factor of existing.data.all) {
        if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
      if (error) throw error
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    },
  })
}

/** Confirms a code, both when setting up and when signing in. Returns fresh recovery codes on setup. */
export function useVerifyMfa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ factorId, code, issueRecoveryCodes }: { factorId: string; code: string; issueRecoveryCodes?: boolean }) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
      if (error) throw error
      if (!issueRecoveryCodes) return null
      const codes = await supabase.rpc('create_mfa_recovery_codes')
      if (codes.error) throw codes.error
      return codes.data
    },
    // Everything the API refused while the second step was owed can load now.
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useNewRecoveryCodes() {
  return useMutation({
    mutationFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('create_mfa_recovery_codes')
      if (error) throw error
      return data
    },
  })
}

export function useRemoveMfa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      await supabase.auth.refreshSession()
      const recorded = await supabase.rpc('record_mfa_removed')
      if (recorded.error) throw recorded.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.security.all }),
  })
}

/** Lost phone: a recovery code turns the second step off so the owner can sign in and set it up again. */
export function useRecoverMfa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.functions.invoke('mfa-recover', { body: { code } })
      if (error) {
        // The function explains itself in its body; the SDK's own message does not.
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error((detail as { error?: string } | null)?.error ?? 'We could not check that code. Try again.')
      }
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
      await supabase.auth.refreshSession()
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}
