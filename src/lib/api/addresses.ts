import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { SavedAddress } from '../database.types'

export type AddressInput = Pick<SavedAddress, 'label' | 'recipient' | 'phone' | 'address' | 'is_default'> & { id?: string }

export function useAddresses() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.addresses.all,
    enabled: Boolean(user),
    queryFn: async (): Promise<SavedAddress[]> => {
      const { data, error } = await supabase.from('saved_addresses').select('*')
        .eq('profile_id', user!.id).order('is_default', { ascending: false }).order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useSaveAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddressInput) => {
      const { data, error } = await supabase.rpc('save_address', {
        p_id: input.id ?? null, p_label: input.label, p_recipient: input.recipient,
        p_phone: input.phone, p_address: input.address, p_default: input.is_default,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses.all }),
  })
}

export function useDeleteAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_address', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses.all }),
  })
}
