import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { JobPost, ProviderRequest, SentQuote } from '../database.types'

export function useJobPosts(opts: { mineOnly?: boolean } = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: [...keys.marketplace.jobs(), opts.mineOnly ?? false],
    queryFn: async (): Promise<JobPost[]> => {
      let q = supabase.from('job_posts').select('*').eq('status', 'open')
      if (opts.mineOnly) q = q.eq('customer_id', user!.id)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
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
      qc.invalidateQueries({ queryKey: keys.marketplace.jobs() })
    },
  })
}

/** Quotes on a job the user owns, or quotes the user has sent as a provider. */
export function useQuotes(jobId?: string) {
  return useQuery({
    queryKey: jobId ? keys.marketplace.quotesForJob(jobId) : keys.marketplace.quotes(),
    queryFn: async (): Promise<SentQuote[]> => {
      let q = supabase.from('sent_quotes').select('*')
      if (jobId) q = q.eq('job_id', jobId)
      const { data, error } = await q.order('created_at', { ascending: false })
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
      const { error } = await supabase
        .from('sent_quotes')
        .insert({ provider_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.marketplace.quotes() })
      qc.invalidateQueries({ queryKey: keys.marketplace.quotesForJob(vars.job_id) })
    },
  })
}

export function useProviderRequests() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.marketplace.requests(),
    enabled: Boolean(user),
    queryFn: async (): Promise<ProviderRequest[]> => {
      const { data, error } = await supabase
        .from('provider_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useRespondToRequest() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_to_request', {
        p_request_id: requestId,
        p_accept: accept,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace.requests() })
    },
  })
}
