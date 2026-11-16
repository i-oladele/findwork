import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../authContext'
import { supabase } from '../supabase'

export function useBlockStatus(profileId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['blocks', user?.id, profileId],
    enabled: Boolean(user && profileId && profileId !== user.id),
    queryFn: async () => {
      const [own, either] = await Promise.all([
        supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user!.id).eq('blocked_id', profileId!).maybeSingle(),
        supabase.rpc('users_blocked', { p_first: user!.id, p_second: profileId! }),
      ])
      if (own.error) throw own.error
      if (either.error) throw either.error
      return { mine: Boolean(own.data), blocked: either.data }
    },
  })
}

export function useSetUserBlocked(profileId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (blocked: boolean) => {
      if (!user || user.id === profileId) throw new Error('Choose another account to block.')
      const result = blocked
        ? await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: profileId })
        : await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', profileId)
      if (result.error && !(blocked && result.error.code === '23505')) throw result.error
    },
    onSuccess: async () => {
      // A block changes social visibility and message eligibility too.
      await qc.invalidateQueries()
    },
  })
}
