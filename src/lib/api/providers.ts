import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ProviderPackage, ProviderProfile, Tables, TablesUpdate } from '../database.types'

export type ProviderFilters = {
  query?: string
  category?: string
  maxPrice?: number
  verifiedOnly?: boolean
  minRating?: number
  limit?: number
}

export function useProviders(filters: ProviderFilters = {}) {
  return useQuery({
    queryKey: keys.providers.list(filters),
    queryFn: async (): Promise<ProviderProfile[]> => {
      let q = supabase.from('provider_profiles').select('*')

      const term = filters.query?.trim().replace(/[%,()]/g, ' ')
      if (term) {
        // Match either the business name or the category.
        q = q.or(`business_name.ilike.%${term}%,category.ilike.%${term}%`)
      }
      if (filters.category) q = q.eq('category', filters.category)
      if (filters.maxPrice !== undefined) q = q.lt('price', filters.maxPrice)
      if (filters.verifiedOnly) q = q.eq('verified', true)
      if (filters.minRating !== undefined) q = q.gte('rating', filters.minRating)

      // Paid plans buy priority placement; within a tier, best rated first.
      const { data, error } = await q
        .order('priority', { ascending: false })
        .order('rating', { ascending: false })
        .limit(filters.limit ?? 50)
      if (error) throw error
      return data
    },
  })
}

/** How many providers work in each category, for the category grid. */
export function useProviderCategoryCounts() {
  return useQuery({
    queryKey: keys.providers.categories(),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('provider_profiles').select('category')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data) counts[row.category] = (counts[row.category] ?? 0) + 1
      return counts
    },
  })
}

export function useProvider(id: string | undefined) {
  return useQuery({
    queryKey: keys.providers.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ProviderProfile | null> => {
      const { data, error } = await supabase.from('provider_profiles').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** The signed-in user's own provider profile, or null if they have not started selling. */
export function useMyProviderProfile() {
  const { user } = useAuth()
  return useProvider(user?.id)
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

/** Create or edit one of your own packages. The plan's listing limit is enforced by a trigger. */
export function useSavePackage() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      id?: string
      name: string
      price: number
      detail?: string | null
      duration_minutes?: number
    }) => {
      const { id, ...fields } = input
      const { error } = id
        ? await supabase.from('provider_packages').update(fields).eq('id', id)
        : await supabase.from('provider_packages').insert({ provider_id: user!.id, ...fields })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.packages(user?.id ?? '') })
    },
  })
}

export function useDeletePackage() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('provider_packages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.packages(user?.id ?? '') })
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

export function useUpdateProviderProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (patch: TablesUpdate<'provider_profiles'>) => {
      const { error } = await supabase.from('provider_profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.all })
    },
  })
}

/** The "switch to selling" step: creates the caller's provider profile. */
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
      const { error } = await supabase.from('provider_profiles').insert({ id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.providers.all })
    },
  })
}

/** Time ranges a provider is already booked for, so the picker can grey them out. */
export function useBusySlots(providerId: string | undefined, from: string, to: string, bookingId?: string) {
  return useQuery({
    queryKey: keys.providers.busy(providerId ?? '', from, to, bookingId),
    enabled: Boolean(providerId),
    queryFn: async () => {
      const { data, error } = bookingId
        ? await supabase.rpc('reschedule_busy_slots', { p_booking_id: bookingId, p_from: from, p_to: to })
        : await supabase.rpc('provider_busy_slots', {
        p_provider_id: providerId!,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return data ?? []
    },
  })
}
