// Thin Paystack client. Amounts cross this boundary in kobo (naira x 100),
// which is what Paystack's API speaks; everything in our database is naira.
import { requireEnv } from './env.ts'

const API = 'https://api.paystack.co'

type PaystackResponse<T> = { status: boolean; message: string; data: T }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = (await res.json().catch(() => null)) as PaystackResponse<T> | null
  if (!res.ok || !body?.status) {
    throw new Error(`Paystack ${path}: ${body?.message ?? res.statusText}`)
  }
  return body.data
}

export function initializeTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  /** Limits how the customer may pay, e.g. ['card'] when the card is to be kept. */
  channels?: string[]
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl,
        currency: 'NGN',
        ...(input.channels ? { channels: input.channels } : {}),
      }),
    },
  )
}

/** Paystack's description of the card used. reusable cards can be charged again with authorization_code. */
export type Authorization = {
  authorization_code?: string
  signature?: string
  reusable?: boolean
  last4?: string
  exp_month?: string
  exp_year?: string
  card_type?: string
  bank?: string
}

export type VerifiedTransaction = {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed'
  reference: string
  amount: number
  currency: string
  gateway_response?: string
  authorization?: Authorization
  customer?: { email?: string }
}

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/** Charges a saved card again, for a renewal. Paystack answers at once for most cards. */
export function chargeAuthorization(input: { authorizationCode: string; email: string; amountKobo: number; reference: string }) {
  return call<VerifiedTransaction>('/transaction/charge_authorization', {
    method: 'POST',
    body: JSON.stringify({
      authorization_code: input.authorizationCode,
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      currency: 'NGN',
    }),
  })
}

export type Bank = { name: string; code: string; active: boolean }

/** Nigerian banks that can receive transfers. */
export function listBanks() {
  return call<Bank[]>('/bank?country=nigeria&currency=NGN&perPage=200')
}

/** The bank's own name for an account: proof the number is real and whose it is. */
export function resolveAccount(accountNumber: string, bankCode: string) {
  return call<{ account_number: string; account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  )
}

export function createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
  return call<{ recipient_code: string }>('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({ type: 'nuban', name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' }),
  })
}

export type TransferStatus = 'success' | 'pending' | 'failed' | 'reversed' | 'otp' | 'received' | 'processing' | 'queued' | 'abandoned' | 'blocked' | 'rejected'

/** Sends money from the Paystack balance. The reference makes a retry of the same request harmless. */
export function initiateTransfer(input: { amountKobo: number; recipientCode: string; reference: string; reason: string }) {
  return call<{ status: TransferStatus; transfer_code: string; reference: string }>('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      amount: input.amountKobo,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
      currency: 'NGN',
    }),
  })
}

/**
 * Paystack signs each webhook body with HMAC-SHA512 using the secret key.
 * Anything that fails this check did not come from Paystack.
 */
export async function isValidSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requireEnv('PAYSTACK_SECRET_KEY')),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature.toLowerCase())
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
