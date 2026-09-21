import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { JobPost, ProviderProfile, SentQuote } from '../database.types'

/** Open jobs posted by other people — what a provider can quote on. */
export function useOpenJobs() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.marketplace.openJobs(),
    enabled: Boolean(user),
    queryFn: async (): Promise<JobPost[]> => {
      const { data, error } = await supabase
        .from('job_posts')
        .select('*')
        .eq('status', 'open')
        .neq('customer_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })
}

/** Jobs the signed-in user has posted, open and closed. */
export function useMyJobs() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.marketplace.myJobs(),
    enabled: Boolean(user),
    queryFn: async (): Promise<JobPost[]> => {
      const { data, error } = await supabase
        .from('job_posts')
        .select('*')
        .eq('customer_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: keys.marketplace.job(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<JobPost | null> => {
      const { data, error } = await supabase.from('job_posts').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePostJob() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      title: string
      description: string
      budget: number
      needed_by?: string
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('job_posts')
        .insert({ customer_id: user!.id, ...input })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace.jobs })
    },
  })
}

export function useCloseJob() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from('job_posts').update({ status: 'closed' }).eq('id', jobId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace.jobs })
    },
  })
}

export type QuoteWithProvider = SentQuote & { provider: ProviderProfile | null }

/**
 * Quotes on one job, with the quoting provider's public profile. RLS limits
 * this to the job owner (all quotes) or a provider (their own).
 */
export function useQuotesForJob(jobId: string | undefined) {
  return useQuery({
    queryKey: keys.marketplace.quotesForJob(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async (): Promise<QuoteWithProvider[]> => {
      const { data: quotes, error } = await supabase
        .from('sent_quotes')
        .select('*')
        .eq('job_id', jobId!)
        .order('price')
      if (error) throw error
      if (!quotes.length) return []

      // sent_quotes points at profiles, not provider_profiles, so the
      // business name and rating come from a second lookup.
      const { data: providers, error: pErr } = await supabase
        .from('provider_profiles')
        .select('*')
        .in('id', quotes.map((q) => q.provider_id))
      if (pErr) throw pErr

      return quotes.map((q) => ({ ...q, provider: providers.find((p) => p.id === q.provider_id) ?? null }))
    },
  })
}

/** Quotes the signed-in provider has sent. */
export function useMySentQuotes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.marketplace.sentQuotes(),
    enabled: Boolean(user),
    queryFn: async (): Promise<SentQuote[]> => {
      const { data, error } = await supabase
        .from('sent_quotes')
        .select('*')
        .eq('provider_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSendQuote() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      job_id: string
      price: number
      days: number
      start_day?: string
      message?: string
    }) => {
      const { error } = await supabase.from('sent_quotes').insert({ provider_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.marketplace.quotes })
      qc.invalidateQueries({ queryKey: keys.marketplace.quotesForJob(vars.job_id) })
      qc.invalidateQueries({ queryKey: keys.marketplace.jobs })
    },
  })
}

/** Books the quoting provider at the quoted price and pays escrow; closes the job. */
export function useAcceptJobQuote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { quoteId: string; startAt: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_job_quote', {
        p_quote_id: input.quoteId,
        p_start_at: input.startAt,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace.jobs })
      qc.invalidateQueries({ queryKey: keys.marketplace.quotes })
      qc.invalidateQueries({ queryKey: keys.bookings.all })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}
