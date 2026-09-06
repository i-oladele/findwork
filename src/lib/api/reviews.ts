import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Review } from '../database.types'

export type ReviewWithAuthor = Review & { reviewer: { full_name: string; avatar_url: string | null } | null }

export function useProviderReviews(providerId: string | undefined) {
  return useQuery({
    queryKey: keys.providers.reviews(providerId ?? ''),
    enabled: Boolean(providerId),
    queryFn: async (): Promise<ReviewWithAuthor[]> => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
        .eq('provider_id', providerId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/**
 * The insert policy only accepts a review from the customer on a booking that
 * is already 'done', so the review right is earned by completing and paying
 * for a job. The provider's rating column is recomputed by a trigger.
 */
export function useLeaveReview() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { bookingId: string; providerId: string; rating: number; body?: string }) => {
      const { error } = await supabase.from('reviews').insert({
        booking_id: input.bookingId,
        reviewer_id: user!.id,
        provider_id: input.providerId,
        rating: input.rating,
        body: input.body ?? '',
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.providers.reviews(vars.providerId) })
      qc.invalidateQueries({ queryKey: keys.providers.detail(vars.providerId) })
    },
  })
}
