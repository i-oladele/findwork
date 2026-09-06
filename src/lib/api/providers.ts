import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ProviderPackage, ProviderProfile, Tables } from '../database.types'

export type ProviderFilters = {
  query?: string
  category?: string
  maxPrice?: number
  verifiedOnly?: boolean
  minRating?: number
}

export function useProviders(filters: ProviderFilters = {}) {
  return useQuery({
    queryKey: keys.providers.list(filters),
    queryFn: async (): Promise<ProviderProfile[]> => {
      let q = supabase.from('provider_profiles').select('*')

      if (filters.query?.trim()) {
        // Match either the business name or the category, mirroring what the
        // search screen filtered on client-side against mock data.
        const term = `%${filters.query.trim()}%`
        q = q.or(`business_name.ilike.${term},category.ilike.${term}`)
      }
      if (filters.category) q = q.eq('category', filters.category)
      if (filters.maxPrice !== undefined) q = q.lt('price', filters.maxPrice)
      if (filters.verifiedOnly) q = q.eq('verified', true)
      if (filters.minRating !== undefined) q = q.gte('rating', filters.minRating)

      const { data, error } = await q.order('rating', { ascending: false }).limit(50)
      if (error) throw error
      return data
    },
  })
}

export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: keys.providers.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ProviderProfile> => {
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useProviderPackages(providerId: string | undefined) {
  return useQuery({
    queryKey: keys.providers.packages(providerId ?? ''),
    enabled: Boolean(providerId),
    queryFn: async (): Promise<ProviderPackage[]> => {
      const { data, error } = await supabase
        .from('provider_packages')
        .select('*')
        .eq('provider_id', providerId!)
        .order('price')
      if (error) throw error
      return data
    },
  })
}

/** Provider-side: flip one of your own packages between live and paused. */
export function useTogglePackageStatus() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'live' | 'paused' }) => {
      const { error } = await supabase.from('provider_packages').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.packages(user?.id ?? '') })
    },
  })
}

export function useProviderAvailability(providerId: string | undefined) {
  return useQuery({
    queryKey: keys.providers.availability(providerId ?? ''),
    enabled: Boolean(providerId),
    queryFn: async (): Promise<Tables<'provider_availability'> | null> => {
      const { data, error } = await supabase
        .from('provider_availability')
        .select('*')
        .eq('provider_id', providerId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateAvailability() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (patch: Partial<Omit<Tables<'provider_availability'>, 'provider_id'>>) => {
      const { error } = await supabase
        .from('provider_availability')
        .upsert({ provider_id: user!.id, ...patch })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.availability(user?.id ?? '') })
    },
  })
}

/** Whether the signed-in user has switched on selling. Drives provider nav. */
export function useIsProvider() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.providers.detail(user?.id ?? ''),
    enabled: Boolean(user),
    queryFn: async (): Promise<ProviderProfile | null> => {
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useBecomeProvider() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      business_name: string
      category: string
      location: string
      bio?: string
      price?: number
      price_unit?: string
    }) => {
      const { data, error } = await supabase
        .from('provider_profiles')
        .insert({ id: user!.id, ...input })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.all })
    },
  })
}
