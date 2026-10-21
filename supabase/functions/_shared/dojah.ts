// Thin Dojah client (https://docs.dojah.io). Deno runtime.
//
// Secrets: DOJAH_APP_ID, DOJAH_SECRET_KEY, and DOJAH_BASE_URL set to
// https://sandbox.dojah.io while testing (the default is the live API).
// Sandbox numbers: NIN 70123456789, BVN 22222222222, phone 09011111111,
// RC 1261103 — see https://docs.dojah.io/api-reference/get-started/sandbox-test-data
import type { DojahApi, DojahAnswer } from '../identity-check/identityCheck.ts'

const base = () => (Deno.env.get('DOJAH_BASE_URL') ?? 'https://api.dojah.io').replace(/\/$/, '')

export function dojahConfigured(): boolean {
  return Boolean(Deno.env.get('DOJAH_APP_ID') && Deno.env.get('DOJAH_SECRET_KEY'))
}

// A register that has no such record answers 404 (or 400 with a message);
// that is an answer, not a failure. Anything else is thrown and recorded as
// an error, which leaves the decision to staff.
async function call(path: string, init: RequestInit = {}): Promise<DojahAnswer> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: Deno.env.get('DOJAH_SECRET_KEY') ?? '',
      AppId: Deno.env.get('DOJAH_APP_ID') ?? '',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = (await res.json().catch(() => null)) as { entity?: Record<string, unknown>; error?: string } | null
  if (res.ok && body?.entity) return { found: true, entity: body.entity }
  if (res.status === 404 || res.status === 400) return { found: false, message: body?.error ?? res.statusText }
  throw new Error(`Dojah ${path.split('?')[0]}: ${body?.error ?? res.status}`)
}

export const dojah: DojahApi = {
  ninLookup: (nin) => call(`/api/v1/kyc/nin?nin=${encodeURIComponent(nin)}`),
  ninSelfie: (nin, selfie) => call('/api/v1/kyc/nin/verify', { method: 'POST', body: JSON.stringify({ nin, selfie_image: selfie }) }),
  bvnSelfie: (bvn, selfie) => call('/api/v1/kyc/bvn/verify', { method: 'POST', body: JSON.stringify({ bvn, selfie_image: selfie }) }),
  phoneLookup: (phone) => call(`/api/v1/kyc/phone_number/basic?phone_number=${encodeURIComponent(phone)}`),
  cacLookup: (rc, type) => call(`/api/v1/kyc/cac/basic?rc_number=${encodeURIComponent(rc)}&company_type=${encodeURIComponent(type)}`),
}
