import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Classified, ClassifiedCategory } from '../database.types'

export type ClassifiedWithSeller = Classified & {
  seller: { id: string; full_name: string; avatar_url: string | null } | null
}

const SELECT = '*, seller:profiles!classifieds_seller_id_fkey(id, full_name, avatar_url)'

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
