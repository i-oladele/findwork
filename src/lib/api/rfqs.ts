import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Rfq, RfqQuote } from '../database.types'

/**
 * 'mine': RFQs the signed-in user posted. 'open': other people's RFQs still
 * taking quotes — the supplier's view.
 */
export function useRfqs(scope: 'mine' | 'open') {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.rfqs.list(scope),
    enabled: Boolean(user),
    queryFn: async (): Promise<Rfq[]> => {
      let q = supabase.from('rfqs').select('*')
      q = scope === 'mine' ? q.eq('buyer_id', user!.id) : q.neq('buyer_id', user!.id).in('status', ['open', 'quoted'])
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data
    },
  })
}

export function useRfq(id: string | undefined) {
  return useQuery({
    queryKey: keys.rfqs.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Rfq | null> => {
      const { data, error } = await supabase.from('rfqs').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePostRfq() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      title: string
      description: string
      quantity?: string
      budget_max?: number
      deadline?: string
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('rfqs')
        .insert({ buyer_id: user!.id, ...input })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rfqs.all })
    },
  })
}

export type RfqQuoteWithSupplier = RfqQuote & {
  supplier: { id: string; full_name: string; avatar_url: string | null } | null
}

/** The buyer sees every quote; a supplier sees only their own (RLS). */
export function useRfqQuotes(rfqId: string | undefined) {
  return useQuery({
    queryKey: keys.rfqs.quotes(rfqId ?? ''),
    enabled: Boolean(rfqId),
    queryFn: async (): Promise<RfqQuoteWithSupplier[]> => {
      const { data, error } = await supabase
        .from('rfq_quotes')
        .select('*, supplier:profiles!rfq_quotes_supplier_id_fkey(id, full_name, avatar_url)')
        .eq('rfq_id', rfqId!)
        .order('price')
      if (error) throw error
      return data as unknown as RfqQuoteWithSupplier[]
    },
  })
}

export function useSubmitRfqQuote() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { rfq_id: string; price: number; message?: string; lead_time?: string }) => {
      const { error } = await supabase.from('rfq_quotes').insert({ supplier_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.rfqs.quotes(vars.rfq_id) })
      qc.invalidateQueries({ queryKey: keys.rfqs.all })
    },
  })
}

/** Accepting one quote un-accepts the rest and closes the RFQ, atomically. */
export function useAcceptRfqQuote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase.rpc('accept_rfq_quote', { p_quote_id: quoteId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rfqs.all })
    },
  })
}

export function useCloseRfq() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (rfqId: string) => {
      const { error } = await supabase.from('rfqs').update({ status: 'closed' }).eq('id', rfqId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rfqs.all })
    },
  })
}
