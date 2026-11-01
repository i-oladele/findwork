import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'

/** The parts are returned for your own account and to staff; other people get score and tier only. */
export type Trust = { score: number; tier: number; verification?: number; reputation?: number; history?: number; conduct?: number }

export const TIER_LABEL = ['Unconfirmed', 'Contact confirmed', 'ID verified', 'Business verified'] as const // i18n

export function useTrust(profileId: string | undefined | null) {
  return useQuery({
    queryKey: keys.trust.score(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Trust> => {
      const { data, error } = await supabase.rpc('trust_score', { p_profile_id: profileId! })
      if (error) throw error
      return data as unknown as Trust
    },
  })
}

export type Limits = {
  tier: number; label: string
  daily_withdrawal: number; withdrawn_today: number
  daily_transfer: number; transferred_today: number
}

/** What this account may withdraw and send today, by verification tier. */
export function useMyLimits() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.trust.limits(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Limits> => {
      const { data, error } = await supabase.rpc('my_limits')
      if (error) throw error
      return data as unknown as Limits
    },
  })
}
