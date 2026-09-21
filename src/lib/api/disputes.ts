import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Dispute, DisputeOutcome, DisputeRefType } from '../database.types'

/** Disputes the signed-in user raised or that were raised against them. */
export function useDisputes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.disputes.list(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Dispute[]> => {
      const { data, error } = await supabase
        .from('disputes')
        .select('*')
        .or(`raised_by.eq.${user!.id},against_id.eq.${user!.id}`)
        .order('opened_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useDispute(id: string | undefined) {
  return useQuery({
    queryKey: keys.disputes.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Dispute | null> => {
      const { data, error } = await supabase.from('disputes').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Opens a dispute and freezes the money behind it: while it is open the
 * escrow cannot be released or cancelled, and the order cannot be cancelled.
 * The server checks the caller is a party to what they are disputing.
 */
export function useOpenDispute() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      refType: DisputeRefType
      refId: string
      reason: string
      evidencePaths?: string[]
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('open_dispute', {
        p_ref_type: input.refType,
        p_ref_id: input.refId,
        p_reason: input.reason,
        p_evidence_paths: input.evidencePaths ?? [],
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.disputes.all })
      qc.invalidateQueries({ queryKey: keys.admin.all })
    },
  })
}

/** Admin only: settle a dispute, moving the held money one way or the other. */
export function useResolveDispute() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { disputeId: string; outcome: DisputeOutcome; note: string }) => {
      const { error } = await supabase.rpc('resolve_dispute', {
        p_dispute_id: input.disputeId,
        p_outcome: input.outcome,
        p_note: input.note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.disputes.all })
      qc.invalidateQueries({ queryKey: keys.admin.all })
      qc.invalidateQueries({ queryKey: keys.bookings.all })
      qc.invalidateQueries({ queryKey: keys.commerce.orders() })
    },
  })
}
