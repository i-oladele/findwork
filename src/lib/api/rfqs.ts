import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Rfq, RfqQuote } from '../database.types'

export function useRfqs(opts: { mineOnly?: boolean } = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: [...keys.rfqs.list(), opts.mineOnly ?? false],
    queryFn: async (): Promise<Rfq[]> => {
      let q = supabase.from('rfqs').select('*')
      if (opts.mineOnly) q = q.eq('buyer_id', user!.id)
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
    queryFn: async (): Promise<Rfq> => {
      const { data, error } = await supabase.from('rfqs').select('*').eq('id', id!).single()
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

export function useRfqQuotes(rfqId: string | undefined) {
  return useQuery({
    queryKey: keys.rfqs.quotes(rfqId ?? ''),
    enabled: Boolean(rfqId),
    queryFn: async (): Promise<RfqQuote[]> => {
      const { data, error } = await supabase
        .from('rfq_quotes')
        .select('*')
        .eq('rfq_id', rfqId!)
        .order('price')
      if (error) throw error
      return data
    },
  })
}

export function useSubmitRfqQuote() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { rfq_id: string; price: number; message?: string }) => {
      const { error } = await supabase
        .from('rfq_quotes')
        .insert({ supplier_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.rfqs.quotes(vars.rfq_id) })
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
