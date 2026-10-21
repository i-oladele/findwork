import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { BusinessVerification, IdentityCheck, Verification, VerificationIdType } from '../database.types'

/**
 * Verifying an account: the person sends an ID and a selfie. The
 * identity-check Edge Function checks them with the national register
 * through Dojah and verifies the account on the spot when everything
 * matches; otherwise the FindWork team approves or rejects it (admin.ts).
 * Until then the Home screen asks them to finish it.
 */

export type RegisterResult = 'approved' | 'referred' | 'pending' | 'rejected' | null

/**
 * Asks the national register about a submission. null when the check is not
 * set up or could not run: the submission then simply waits for staff.
 */
export async function checkWithRegister(subject: { verification_id: string } | { business_verification_id: string }): Promise<RegisterResult> {
  const { data, error } = await supabase.functions.invoke('identity-check', { body: subject })
  if (error) return null
  return ((data as { status?: string })?.status ?? null) as RegisterResult
}

/** Their most recent submission, or null if they have not sent one. */
export function useMyVerification() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.verification.mine(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Verification | null> => {
      const { data, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('profile_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSubmitVerification() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      idType: VerificationIdType
      idNumber: string
      /** Paths returned by uploading to the private verification-documents bucket. */
      documentPath: string
      selfiePath: string
    }) => {
      const { data, error } = await supabase.rpc('submit_verification', {
        p_id_type: input.idType,
        p_id_number: input.idNumber,
        p_document_path: input.documentPath,
        p_selfie_path: input.selfiePath,
      })
      if (error) throw error
      return checkWithRegister({ verification_id: data })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.verification.mine() })
      qc.invalidateQueries({ queryKey: keys.profile.all })
      qc.invalidateQueries({ queryKey: keys.trust.all })
    },
  })
}

/** Their most recent business (CAC) submission, or null. */
export function useMyBusinessVerification() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.verification.business(),
    enabled: Boolean(user),
    queryFn: async (): Promise<BusinessVerification | null> => {
      const { data, error } = await supabase.from('business_verifications').select('*').eq('profile_id', user!.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSubmitBusinessVerification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { rcNumber: string; businessName: string; documentPath: string }) => {
      const { data, error } = await supabase.rpc('submit_business_verification', {
        p_rc_number: input.rcNumber, p_business_name: input.businessName, p_document_path: input.documentPath,
      })
      if (error) throw error
      return checkWithRegister({ business_verification_id: data })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.verification.business() })
      qc.invalidateQueries({ queryKey: keys.profile.all })
      qc.invalidateQueries({ queryKey: keys.trust.all })
    },
  })
}

/** What the register said about one submission, for its owner or verification staff. */
export function useIdentityChecks(subjectType: 'verification' | 'business_verification', subjectId: string | null | undefined) {
  return useQuery({
    queryKey: keys.verification.checks(subjectId ?? ''),
    enabled: Boolean(subjectId),
    queryFn: async (): Promise<IdentityCheck[]> => {
      const { data, error } = await supabase.from('identity_checks').select('*')
        .eq('subject_type', subjectType).eq('subject_id', subjectId!).order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** Verification staff: ask the register again, for instance after an error. */
export function useRunIdentityCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (subject: { verification_id: string } | { business_verification_id: string }) => {
      const { error } = await supabase.functions.invoke('identity-check', { body: subject })
      if (error) {
        const status = (error as { context?: Response }).context?.status
        throw new Error(status === 503 ? 'Register checks are not set up yet: add the Dojah keys (see the README).' : 'The register could not be reached. Try again shortly.')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.verification.all })
      qc.invalidateQueries({ queryKey: keys.admin.all })
    },
  })
}
