import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ReportTargetType, SupportRequest, SupportTopic } from '../database.types'

export function useMySupportRequests() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.support.mine(),
    enabled: Boolean(user),
    queryFn: async (): Promise<SupportRequest[]> => {
      const { data, error } = await supabase
        .from('support_requests')
        .select('*')
        .eq('profile_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateSupportRequest() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { topic: SupportTopic; message: string }) => {
      const { error } = await supabase.from('support_requests').insert({ profile_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.support.all })
    },
  })
}

/** Flags content for a moderator. Reporting the same thing twice is a no-op. */
export function useReport() {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { targetType: ReportTargetType; targetId: string; reason: string; details?: string }) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: user!.id,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        details: input.details || null,
      })
      // 23505: already reported by this user — treat as success.
      if (error && error.code !== '23505') throw error
    },
  })
}
