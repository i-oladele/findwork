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

/**
 * Saves where you are: an exact pin with the address it was found at. The
 * database fills in the nearest listed area; the pin stays private to you.
 * Returns that area, or null outside the areas listed so far.
 */
export function useSetMyLocation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (place: { lat: number; lng: number; label: string }): Promise<string | null> => {
      const { data, error } = await supabase.rpc('set_my_location', {
        p_lat: place.lat,
        p_lng: place.lng,
        p_label: place.label,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.profile.me() })
      // Distances to providers are worked out from this point.
      qc.invalidateQueries({ queryKey: keys.providers.all })
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
