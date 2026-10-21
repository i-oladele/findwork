import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { PaymentCard, Subscription, SubscriptionPlan } from '../database.types'

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

/** Cards kept for renewing a plan. Only their description is readable. */
export function usePaymentCards() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.wallet.cards(),
    enabled: Boolean(user),
    queryFn: async (): Promise<PaymentCard[]> => {
      const { data, error } = await supabase.from('payment_cards')
        .select('id, profile_id, brand, last4, exp_month, exp_year, bank, created_at').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useInvalidateCards() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.wallet.cards() })
    qc.invalidateQueries({ queryKey: keys.billing.subscription() })
  }
}

/** Which saved card renews the plan; null renews from the wallet. */
export function useSetPlanCard() {
  const invalidate = useInvalidateCards()
  return useMutation({
    mutationFn: async (cardId: string | null) => {
      const { error } = await supabase.rpc('set_plan_card', { p_card_id: cardId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemovePaymentCard() {
  const invalidate = useInvalidateCards()
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('remove_payment_card', { p_card_id: cardId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
