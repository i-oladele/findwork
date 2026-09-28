/**
 * Verifies a Standard Webhooks signature (https://www.standardwebhooks.com),
 * which is how Supabase Auth signs its hook calls. Kept free of imports so it
 * can be unit-tested from Vitest.
 *
 * The secret is what the dashboard shows when the hook is created:
 * "v1,whsec_<base64 key>". Each request carries webhook-id,
 * webhook-timestamp and webhook-signature ("v1,<base64 HMAC>", possibly
 * several, space separated). The HMAC-SHA256 is over "<id>.<timestamp>.<body>".
 */
const TOLERANCE_SECONDS = 5 * 60

export async function isValidWebhook(
  body: string,
  headers: { get(name: string): string | null },
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatures = headers.get('webhook-signature')
  if (!id || !timestamp || !signatures) return false

  // An old request replayed later is refused, as is one from the future.
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) return false

  let keyBytes: Uint8Array<ArrayBuffer>
  try {
    keyBytes = Uint8Array.from(atob(secret.replace(/^v1,/, '').replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  } catch {
    return false
  }
  if (keyBytes.length === 0) return false

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return signatures
    .split(' ')
    .map((entry) => entry.split(','))
    .some(([version, signature]) => version === 'v1' && signature !== undefined && timingSafeEqual(signature, expected))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
