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
      }),
    },
  )
}

export type VerifiedTransaction = {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed'
  reference: string
  amount: number
  currency: string
}

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
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
