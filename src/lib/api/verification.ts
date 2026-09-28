import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Verification, VerificationIdType } from '../database.types'

/**
 * Verifying an account: the person sends an ID and a selfie, and the
 * FindWork team approves or rejects it (admin.ts). Until then the Home
 * screen asks them to finish it.
 */

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
      const { error } = await supabase.rpc('submit_verification', {
        p_id_type: input.idType,
        p_id_number: input.idNumber,
        p_document_path: input.documentPath,
        p_selfie_path: input.selfiePath,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.verification.mine() })
    },
  })
}
