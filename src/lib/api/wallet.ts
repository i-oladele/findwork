import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { WalletTransaction } from '../database.types'

export type WalletSummary = { balance: number; escrow_held: number }

/**
 * Balance is never a stored column — it is the sum of the append-only ledger,
 * computed by the wallet_summary function. A client cannot claim a balance
 * that does not match its transaction history.
 */
export function useWalletSummary() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.wallet.summary(),
    enabled: Boolean(user),
    queryFn: async (): Promise<WalletSummary> => {
      const { data, error } = await supabase
        .rpc('wallet_summary', { p_profile_id: user!.id })
        .single()
      if (error) throw error
      return data as WalletSummary
    },
  })
}

export function useTransactions(limit = 50) {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.wallet.transactions(),
    enabled: Boolean(user),
    queryFn: async (): Promise<WalletTransaction[]> => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

/**
 * TODO(payments): this credits the wallet with no money actually changing
 * hands. Before launch it must be replaced by a Paystack/Flutterwave charge
 * plus a signature-verified webhook that writes the ledger row server-side.
 * Until then, treat every balance as play money.
 */
export function useAddMoney() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc('add_money', { p_amount: amount })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}
