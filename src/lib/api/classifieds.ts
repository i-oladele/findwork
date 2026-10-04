import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Classified, ClassifiedCategory } from '../database.types'

export type ClassifiedWithSeller = Classified & {
  seller: { id: string; full_name: string; avatar_url: string | null; verification_tier: number; trust_score: number } | null
}

const SELECT = '*, seller:profiles!classifieds_seller_id_fkey(id, full_name, avatar_url, verification_tier, trust_score)'

export function useClassifieds(category?: ClassifiedCategory) {
  return useQuery({
    queryKey: keys.classifieds.list(category),
    queryFn: async (): Promise<ClassifiedWithSeller[]> => {
      let q = supabase.from('classifieds').select(SELECT)
      if (category) q = q.eq('category', category)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as unknown as ClassifiedWithSeller[]
    },
  })
}

export function useClassified(id: string | undefined) {
  return useQuery({
    queryKey: keys.classifieds.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ClassifiedWithSeller | null> => {
      const { data, error } = await supabase.from('classifieds').select(SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as ClassifiedWithSeller | null
    },
  })
}

export function usePostClassified() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      title: string
      price: number
      category: ClassifiedCategory
      location: string
      description: string
      photo_urls: string[]
      area: string | null
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('classifieds')
        .insert({ seller_id: user!.id, ...input })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classifieds.all })
    },
  })
}

export function useDeleteClassified() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('classifieds').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.classifieds.all })
    },
  })
}

export type NearbyClassified = {
  id: string; seller_id: string; title: string; price: number; category: ClassifiedCategory; location: string
  area: string | null; lat: number; lng: number; photo_urls: string[]; created_at: string; km: number
  seller_tier: number; seller_trust: number
}

/** Listings within `radiusKm` of a point, nearest first. Only listings placed in a listed area can be found this way. */
export function useNearbyClassifieds(point: { lat: number; lng: number } | null, radiusKm: number, category?: ClassifiedCategory) {
  return useQuery({
    queryKey: [...keys.classifieds.all, 'nearby', point?.lat ?? null, point?.lng ?? null, radiusKm, category ?? null],
    enabled: Boolean(point),
    queryFn: async (): Promise<NearbyClassified[]> => {
      const { data, error } = await supabase.rpc('nearby_classifieds', {
        p_lat: point!.lat, p_lng: point!.lng, p_radius_km: radiusKm, p_category: category ?? null,
      })
      if (error) throw error
      return (data as unknown as NearbyClassified[]) ?? []
    },
  })
}
