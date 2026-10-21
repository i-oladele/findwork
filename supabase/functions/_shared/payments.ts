/**
 * The rules the Paystack functions share: what a request to pay may contain,
 * and how Paystack's answers map onto the database's. Kept free of Deno
 * imports so they can be unit-tested from Vitest.
 */
import type { Authorization, TransferStatus, VerifiedTransaction } from './paystack.ts'

export const TOPUP_MIN = 100
export const TOPUP_MAX = 1_000_000
/** Paystack's own ceiling for one card payment is far higher; this is ours. */
export const CARD_MAX = 5_000_000

type CartLine = { product_id: string; variant_id: string | null; qty: number }

export type StartRequest =
  | { purpose: 'topup'; amount: number }
  | {
      purpose: 'checkout'
      items: CartLine[]
      delivery_speed: 'same-day' | 'standard'
      address: string
      phone: string | null
      coupon_code: string | null
      expected_total: number
    }
  | { purpose: 'plan'; plan: string; save_card: boolean }

export type StartError = { error: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checks the shape of a request to start a payment. Prices are not trusted
 * from here: a checkout is priced again by the database before Paystack is
 * asked for anything, and a plan's price is read from the plan.
 */
export function parseStart(body: unknown): StartRequest | StartError {
  const b = (body ?? {}) as Record<string, unknown>
  const purpose = b.purpose ?? 'topup'

  if (purpose === 'topup') {
    const amount = Number(b.amount)
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
      return { error: 'invalid_amount', message: `Enter an amount between ₦${TOPUP_MIN} and ₦${TOPUP_MAX.toLocaleString('en-NG')}.` }
    }
    return { purpose, amount }
  }

  if (purpose === 'checkout') {
    const bad = { error: 'invalid_checkout', message: 'Check your cart and delivery details, then try again.' }
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) return bad
    const items: CartLine[] = []
    for (const raw of b.items as unknown[]) {
      const line = (raw ?? {}) as Record<string, unknown>
      const variant = line.variant_id ?? null
      if (typeof line.product_id !== 'string' || line.product_id.length < 1 || line.product_id.length > 100) return bad
      if (!Number.isInteger(line.qty) || (line.qty as number) < 1 || (line.qty as number) > 99) return bad
      if (variant !== null && (typeof variant !== 'string' || !UUID.test(variant))) return bad
      items.push({ product_id: line.product_id, variant_id: variant as string | null, qty: line.qty as number })
    }
    const address = typeof b.address === 'string' ? b.address.trim() : ''
    const phone = typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : null
    const coupon = typeof b.coupon_code === 'string' && b.coupon_code.trim() ? b.coupon_code.trim() : null
    const total = Number(b.expected_total)
    if (b.delivery_speed !== 'same-day' && b.delivery_speed !== 'standard') return bad
    if (address.length < 5 || address.length > 500 || (phone && phone.length > 20) || (coupon && coupon.length > 40)) return bad
    if (!Number.isInteger(total) || total < 1 || total > CARD_MAX) return bad
    return { purpose, items, delivery_speed: b.delivery_speed, address, phone, coupon_code: coupon, expected_total: total }
  }

  if (purpose === 'plan') {
    if (typeof b.plan !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(b.plan)) return { error: 'invalid_plan', message: 'Choose a plan.' }
    return { purpose, plan: b.plan, save_card: b.save_card === true }
  }

  return { error: 'invalid_purpose', message: 'That is not something we can take a payment for.' }
}

/** The card's description to keep, with the email Paystack charges it under. Null when Paystack sent none. */
export function cardDetails(tx: Pick<VerifiedTransaction, 'authorization' | 'customer'>): (Authorization & { email?: string }) | null {
  if (!tx.authorization?.authorization_code) return null
  return { ...tx.authorization, email: tx.customer?.email }
}

/** What to do with the answer to charging a saved card. */
export function chargeStep(status: VerifiedTransaction['status']): 'settle' | 'fail' | 'wait' {
  if (status === 'success') return 'settle'
  if (status === 'failed' || status === 'abandoned' || status === 'reversed') return 'fail'
  return 'wait'
}

export type PayoutStep = { outcome: 'success' | 'sent' | 'failed'; reason: string | null }

/** Paystack's answer to a transfer, as settle_withdrawal_transfer understands it. */
export function payoutStep(status: TransferStatus): PayoutStep {
  if (status === 'success') return { outcome: 'success', reason: null }
  if (status === 'pending' || status === 'received' || status === 'processing' || status === 'queued') return { outcome: 'sent', reason: null }
  if (status === 'otp') {
    return { outcome: 'failed', reason: 'Paystack asked for an OTP. Turn off OTP for transfers in the Paystack dashboard to pay automatically.' }
  }
  return { outcome: 'failed', reason: `Paystack: ${status}` }
}

/** A transfer webhook event, as an outcome; null for any other event. */
export function transferOutcome(event: string): 'success' | 'failed' | 'reversed' | null {
  if (event === 'transfer.success') return 'success'
  if (event === 'transfer.failed') return 'failed'
  if (event === 'transfer.reversed') return 'reversed'
  return null
}

/** The shared secret pg_net sends with each request, compared in constant time. */
export function hookSecretMatches(sent: string | null, expected: string | undefined): boolean {
  if (!sent || !expected || sent.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
