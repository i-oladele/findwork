import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { PayoutAccount, WalletTransaction, Withdrawal } from '../database.types'

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
      const { data, error } = await supabase.rpc('wallet_summary', { p_profile_id: user!.id }).single()
      if (error) throw error
      const row = data as { balance: number | string; escrow_held: number | string }
      // bigint arrives as a number from PostgREST, but be safe if it is a string.
      return { balance: Number(row.balance), escrow_held: Number(row.escrow_held) }
    },
  })
}

export function useTransactions(limit = 100) {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.wallet.transactions(),
    enabled: Boolean(user),
    queryFn: async (): Promise<WalletTransaction[]> => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('profile_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

/** Reads the error body an Edge Function returned, so its own message reaches the screen. */
async function functionError(error: unknown): Promise<Error> {
  const context = (error as { context?: Response }).context
  const body = (await context?.json().catch(() => null)) as { message?: string; error?: string } | null
  return new Error(body?.message ?? body?.error ?? (error as Error).message)
}

/**
 * Starts a Paystack checkout for a wallet top-up. Returns the URL to send
 * the user to; the wallet is credited only once Paystack confirms payment.
 */
export function useStartTopUp() {
  return useMutation({
    mutationFn: async (amount: number) => {
      const { data, error } = await supabase.functions.invoke('paystack-initialize', { body: { amount } })
      if (error) throw await functionError(error)
      return data as { reference: string; authorization_url: string }
    },
  })
}

export type TopUpStatus = { status: 'success' | 'failed' | 'pending'; amount: number }

/** Asks the server to confirm a returning Paystack payment and credit it. */
export function useVerifyTopUp() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (reference: string) => {
      const { data, error } = await supabase.functions.invoke('paystack-verify', { body: { reference } })
      if (error) throw await functionError(error)
      return data as TopUpStatus
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet.all })
      qc.invalidateQueries({ queryKey: keys.notifications.all })
    },
  })
}

export function usePayoutAccount() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.wallet.payoutAccount(),
    enabled: Boolean(user),
    queryFn: async (): Promise<PayoutAccount | null> => {
      const { data, error } = await supabase
        .from('payout_accounts')
        .select('*')
        .eq('profile_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSavePayoutAccount() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { bank_name: string; account_number: string; account_name: string }) => {
      const { error } = await supabase
        .from('payout_accounts')
        .upsert({ profile_id: user!.id, ...input, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet.payoutAccount() })
    },
  })
}

export function useWithdrawals() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.wallet.withdrawals(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Withdrawal[]> => {
      const { data, error } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('profile_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Takes the amount out of the balance at once and queues it to be sent. */
export function useRequestWithdrawal() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (amount: number) => {
      const { data, error } = await supabase.rpc('request_withdrawal', { p_amount: amount })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}
