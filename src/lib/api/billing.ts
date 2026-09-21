import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Subscription, SubscriptionPlan } from '../database.types'

export function usePlans() {
  return useQuery({
    queryKey: keys.billing.plans(),
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase.from('subscription_plans').select('*').order('price')
      if (error) throw error
      return data
    },
  })
}

export function useSubscription() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.billing.subscription(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('profile_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Charges the first month from the wallet; private.renew_subscriptions
 * charges each month after, or drops the account to Free if it cannot.
 *
 * TODO(store-review): on iOS, selling a digital subscription outside Apple's
 * in-app purchase is the single most common cause of marketplace-app
 * rejection. This wallet-charge path is fine on web and Android; the iOS
 * build needs either IAP or these plans hidden.
 */
export function useSubscribe() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.rpc('subscribe_plan', { p_plan: planId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.billing.subscription() })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
      qc.invalidateQueries({ queryKey: keys.providers.all })
    },
  })
}
