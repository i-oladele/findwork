import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Profile, TablesUpdate } from '../database.types'

export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.profile.me(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: TablesUpdate<'profiles'>) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user!.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(keys.profile.me(), data)
    },
  })
}
