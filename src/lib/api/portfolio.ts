import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import { validatePortfolioFile, type PortfolioKind } from '../portfolio'
import type { ProviderMedia } from '../database.types'

export function usePortfolio(providerId?: string) {
  return useQuery({
    queryKey: keys.providers.portfolio(providerId ?? ''),
    enabled: Boolean(providerId),
    queryFn: async (): Promise<ProviderMedia[]> => {
      const { data, error } = await supabase.from('provider_media').select('*').eq('provider_id', providerId!).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSavePortfolioItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; path?: string; file?: File; kind: PortfolioKind; title: string; description: string }) => {
      if (!user) throw new Error('Sign in to publish your work.')
      let path = input.path
      if (input.file) {
        validatePortfolioFile(input.file, input.kind)
        const extension = input.file.type === 'application/pdf' ? 'pdf' : input.file.type.split('/')[1]
        path = `${user.id}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('provider-media').upload(path, input.file, { contentType: input.file.type, upsert: false })
        if (error) throw error
      }
      if (!path) throw new Error('Choose a file first.')
      const { error } = await supabase.rpc('save_provider_media', {
        p_id: input.id ?? null, p_kind: input.kind, p_path: path, p_title: input.title, p_description: input.description,
      })
      // Do not remove an upload on ambiguous network failures: the save may
      // already have committed. Unpublished objects remain owner-private.
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.providers.portfolio(user?.id ?? '') }),
  })
}

export function useRemovePortfolioItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: path, error } = await supabase.rpc('remove_provider_media', { p_id: id })
      if (error) throw error
      // Unpublishing revokes visitor access even if object cleanup fails.
      const cleanup = await supabase.storage.from('provider-media').remove([path])
      return { cleanupPending: Boolean(cleanup.error) }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.providers.portfolio(user?.id ?? '') }),
  })
}
