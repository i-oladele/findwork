import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Profile, TablesUpdate } from '../database.types'

/**
 * Your own full profile, including email, phone and address. Other users'
 * rows expose only name, location and avatar, so this goes through
 * get_my_profile rather than a table select.
 */
export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.profile.me(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.rpc('get_my_profile')
      if (error) throw error
      return data as Profile
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: TablesUpdate<'profiles'>) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.profile.me() })
    },
  })
}
