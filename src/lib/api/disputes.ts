import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Dispute, DisputeRefType } from '../database.types'

export function useDisputes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.disputes.list(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Dispute[]> => {
      const { data, error } = await supabase
        .from('disputes')
        .select('*')
        .order('opened_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/**
 * TODO(ops): opening a dispute records it but has no effect on money — escrow
 * is not frozen and no refund path exists, and there is no admin surface for
 * a human to adjudicate. Both are required before real funds are at stake.
 */
export function useOpenDispute() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      ref_id: string
      ref_type: DisputeRefType
      reason: string
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('disputes')
        .insert({ raised_by: user!.id, ...input })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.disputes.all })
    },
  })
}
