import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { CartItem } from './commerce'
import type { DeliverySpeed, PaymentPurpose, PayoutAccount, WalletTransaction, Withdrawal } from '../database.types'

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

/** What a Paystack payment can be for. The server prices a checkout and a plan itself. */
export type StartPayment =
  | { purpose: 'topup'; amount: number }
  | {
      purpose: 'checkout'
      items: CartItem[]
      delivery_speed: DeliverySpeed
      address: string
      phone: string
      coupon_code: string | null
      /** The total checkout showed; the server refuses if its own price differs. */
      expected_total: number
    }
  | { purpose: 'plan'; plan: string; save_card: boolean }

/**
 * Starts a Paystack checkout. Returns the URL to send the user to; nothing
 * is credited, ordered or subscribed until Paystack confirms payment.
 */
export function useStartPayment() {
  return useMutation({
    mutationFn: async (body: StartPayment) => {
      const { data, error } = await supabase.functions.invoke('paystack-initialize', { body })
      if (error) throw await functionError(error)
      return data as { reference: string; amount: number; authorization_url: string }
    },
  })
}

/** Whether card payments through Paystack are switched on; false when they are not, or cannot be checked. */
export function usePaystackAvailable() {
  return useQuery({
    queryKey: [...keys.wallet.all, 'paystack-available'],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.functions.invoke('paystack-initialize', { body: { action: 'status' } })
      if (error) return false
      return Boolean((data as { configured?: boolean }).configured)
    },
  })
}

/** A wallet top-up by card or transfer. */
export function useStartTopUp() {
  const start = useStartPayment()
  return { ...start, mutateAsync: (amount: number) => start.mutateAsync({ purpose: 'topup', amount }) }
}

/**
 * refund_due and refunded: the payment reached an account already deleted.
 * outcome: for a checkout, the orders placed ({ order_ids }) or why they
 * could not be ({ error }, the money then being in the wallet); for a plan,
 * { plan } or { error }.
 */
export type TopUpStatus = {
  status: 'success' | 'failed' | 'pending' | 'refund_due' | 'refunded'
  amount: number
  purpose?: PaymentPurpose
  outcome?: { order_ids?: string[]; plan?: string; error?: string } | null
}

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

export type PayoutBank = { name: string; code: string }

/**
 * The banks Paystack can confirm an account with. null when Paystack is not
 * set up, in which case people type their details in for staff to check.
 */
export function usePayoutBanks() {
  return useQuery({
    queryKey: keys.wallet.banks(),
    staleTime: 3_600_000,
    retry: false,
    queryFn: async (): Promise<PayoutBank[] | null> => {
      const { data, error } = await supabase.functions.invoke('payout-account', { body: { action: 'banks' } })
      if (error) {
        const status = (error as { context?: Response }).context?.status
        if (status === 503 || status === 404) return null
        throw await functionError(error)
      }
      return (data as { banks: PayoutBank[] }).banks
    },
  })
}

/** The bank's own name for an account, before saving it. */
export async function resolvePayoutAccount(bankCode: string, accountNumber: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('payout-account', { body: { action: 'resolve', bank_code: bankCode, account_number: accountNumber } })
  if (error) throw await functionError(error)
  return (data as { account_name: string }).account_name
}

/** Saves an account the bank has confirmed; withdrawals to it can then be paid automatically. */
export function useConfirmPayoutAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { bankCode: string; accountNumber: string }) => {
      const { error } = await supabase.functions.invoke('payout-account', { body: { action: 'save', bank_code: input.bankCode, account_number: input.accountNumber } })
      if (error) throw await functionError(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wallet.payoutAccount() }),
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

export type TransferRecipient = { id: string; name: string; verification_tier: number }

/** Looks up one account by its exact phone number or email; null when nobody matches. */
export async function findTransferRecipient(contact: string): Promise<TransferRecipient | null> {
  const { data, error } = await supabase.rpc('find_transfer_recipient', { p_contact: contact })
  if (error) throw error
  return (data as unknown as TransferRecipient | null) ?? null
}

/** Sends money to another wallet. `id` is made once per attempt, so a retry cannot send twice. */
export function useTransferFunds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; recipientId: string; amount: number; note: string }) => {
      const { error } = await supabase.rpc('transfer_funds', {
        p_id: input.id, p_recipient_id: input.recipientId, p_amount: input.amount, p_note: input.note.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet.all })
      qc.invalidateQueries({ queryKey: keys.trust.limits() })
    },
  })
}
