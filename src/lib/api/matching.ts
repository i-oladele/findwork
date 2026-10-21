import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import { formatDay } from '../format'
import { msg } from '../msg'
import type { JobPost, Product } from '../database.types'

/**
 * Where a match's points came from; they add up to `score`, out of 100. The
 * calendar fields say what the availability points were based on: free
 * working days before `needed_on`, or in the coming week when it is null.
 */
export type MatchBreakdown = {
  score: number; skill: number; location: number; budget: number; availability: number; reputation: number; km: number | null
  taking_bookings?: boolean; needed_on?: string | null; free_days?: number; next_free?: string | null
}

export type MatchedProvider = {
  id: string; business_name: string; category: string; area: string | null; price: number; price_unit: string
  rating: number; reviews: number; verified: boolean; trust_score: number; photo: string | null
  match: MatchBreakdown; quoted: boolean; invited: boolean
}

/** In plain words, why a provider and a job fit. */
export function explainMatch(m: MatchBreakdown): string {
  const parts: string[] = []
  if (m.skill >= 40) parts.push('this is their trade')
  else if (m.skill > 0) parts.push('their trade is mentioned in the job')
  if (m.location >= 25) parts.push('same area')
  else if (m.km != null && m.location > 8) parts.push(`${m.km} km away`)
  if (m.budget >= 15) parts.push('within budget')
  else if (m.budget > 0) parts.push('a little over budget')
  parts.push(...explainAvailability(m))
  if (m.reputation >= 8) parts.push('well reviewed')
  return parts.length ? parts.join(' · ') : 'a weak fit'
}

function explainAvailability(m: MatchBreakdown): string[] {
  if (m.free_days === undefined) return m.availability > 0 ? ['taking bookings'] : []
  if (m.taking_bookings === false) return ['not taking bookings']
  if (m.needed_on) {
    if (m.free_days === 0) return ['fully booked before then']
    if (m.free_days === 1 && m.next_free) return [`free on ${formatDay(m.next_free)}`]
    return [`free on ${m.free_days} days before it is needed`]
  }
  return m.free_days > 0 ? ['free this week'] : ['busy this week']
}

export function useJobMatches(jobId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...keys.marketplace.job(jobId ?? ''), 'matches'],
    enabled: enabled && Boolean(jobId),
    queryFn: async (): Promise<MatchedProvider[]> => {
      const { data, error } = await supabase.rpc('match_providers_for_job', { p_job_id: jobId! })
      if (error) throw error
      return (data as unknown as MatchedProvider[]) ?? []
    },
  })
}

export function useInviteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { jobId: string; providerId: string }) => {
      const { error } = await supabase.rpc('invite_provider_to_job', { p_job_id: input.jobId, p_provider_id: input.providerId })
      if (error) throw error
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: keys.marketplace.job(input.jobId) }),
  })
}

export type RecommendedJob = JobPost & { match: MatchBreakdown; invited: boolean }

/** Open jobs for the signed-in provider, best fit first. */
export function useRecommendedJobs() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.marketplace.jobs, 'recommended'],
    enabled: Boolean(user),
    queryFn: async (): Promise<RecommendedJob[]> => {
      const { data, error } = await supabase.rpc('recommended_jobs')
      if (error) throw error
      return (data as unknown as RecommendedJob[]) ?? []
    },
  })
}

/** The reasons recommended_providers gives for a suggestion, marked so they are translated. */
export const PROVIDER_REASONS = [msg('Matches what you look for'), msg('Near you'), msg('Well reviewed')] as const

export type RecommendedProvider = Omit<MatchedProvider, 'match' | 'quoted' | 'invited'> & { reason: string; score: number }

export function useRecommendedProviders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.providers.all, 'recommended'],
    enabled: Boolean(user),
    queryFn: async (): Promise<RecommendedProvider[]> => {
      const { data, error } = await supabase.rpc('recommended_providers')
      if (error) throw error
      return (data as unknown as RecommendedProvider[]) ?? []
    },
  })
}

export type RecommendedProduct = Pick<Product, 'id' | 'name' | 'price' | 'vendor' | 'seller_id' | 'image_url' | 'photo_urls' | 'stock'> & { reason: string }

export function useRecommendedProducts(productId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.commerce.products(), 'recommended', productId],
    enabled: Boolean(user),
    queryFn: async (): Promise<RecommendedProduct[]> => {
      const { data, error } = await supabase.rpc('recommended_products', { p_product_id: productId })
      if (error) throw error
      return (data as unknown as RecommendedProduct[]) ?? []
    },
  })
}

export type ThreadContext = {
  booking?: { id: string; service: string; status: string; start_at: string; mine: boolean } | null
  order?: { id: string; status: string; total: number; mine: boolean } | null
  purchase_order?: { id: string; number: number; status: string; amount: number } | null
  dispute?: { id: string; ref_type: string; reason: string } | null
}

/** What is open between the two people in a chat. */
export function useThreadContext(threadId: string | undefined) {
  return useQuery({
    queryKey: ['chat', threadId ?? '', 'context'],
    enabled: Boolean(threadId),
    staleTime: 30_000,
    queryFn: async (): Promise<ThreadContext> => {
      const { data, error } = await supabase.rpc('thread_context', { p_thread_id: threadId! })
      if (error) throw error
      return (data as unknown as ThreadContext) ?? {}
    },
  })
}
