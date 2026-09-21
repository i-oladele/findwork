import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { keys } from './keys'
import type { ServiceArea } from '../database.types'

/**
 * The areas a provider or customer can pick from. A fixed list rather than
 * free text, so "near me" has coordinates to work with — and so two people
 * in Yaba are recorded as being in the same place.
 */
export function useServiceAreas() {
  return useQuery({
    queryKey: keys.areas.all(),
    // Changes only when a new city is opened up.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<ServiceArea[]> => {
      const { data, error } = await supabase.from('service_areas').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}
