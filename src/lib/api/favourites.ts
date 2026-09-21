import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ProviderProfile } from '../database.types'

/** Provider ids the signed-in user has saved, for the heart's filled state. */
export function useFavouriteIds() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.favourites.ids(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('favourites').select('provider_id').eq('profile_id', user!.id)
      if (error) throw error
      return new Set(data.map((row) => row.provider_id))
    },
  })
}

/** The saved list itself, with each provider's current details. */
export function useFavourites() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.favourites.list(),
    enabled: Boolean(user),
    queryFn: async (): Promise<ProviderProfile[]> => {
      const { data, error } = await supabase
        .from('favourites')
        .select('created_at, provider:provider_profiles!favourites_provider_id_fkey(*)')
        .eq('profile_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      // A provider who closed their account drops out of the join.
      return data.flatMap((row) => (row.provider ? [row.provider as unknown as ProviderProfile] : []))
    },
  })
}

export function useToggleFavourite() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ providerId, saved }: { providerId: string; saved: boolean }) => {
      const { error } = saved
        ? await supabase.from('favourites').delete().eq('profile_id', user!.id).eq('provider_id', providerId)
        : await supabase.from('favourites').insert({ profile_id: user!.id, provider_id: providerId })
      // Saving something already saved is not an error worth surfacing.
      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.favourites.all })
    },
  })
}
