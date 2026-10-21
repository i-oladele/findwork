/**
 * Firebase Cloud Messaging (HTTP v1) for the iPhone and Android apps:
 * Android directly, the iPhone through FCM's bridge to Apple's push service
 * (the APNs key is uploaded to Firebase, not kept here). Uses only fetch and
 * WebCrypto, and no Deno imports, so it can be unit-tested from Vitest.
 *
 * https://firebase.google.com/docs/cloud-messaging/send/v1-api
 */
import type { PushDevice, PushOutcome, PushPayload } from './pushPayload.ts'

/** The Android notification channel the app creates (src/lib/nativePush.ts). */
export const ANDROID_CHANNEL = 'findwork'
/** Matches web push: an alert that could not be delivered in 15 minutes is dropped. */
const TTL_SECONDS = 900
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type ServiceAccount = { client_email: string; private_key: string }
export type FcmConfig = { projectId: string; account: ServiceAccount }
export type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON together, or null unless both are usable. */
export function fcmConfig(projectId: string | undefined, serviceAccountJson: string | undefined): FcmConfig | null {
  if (!projectId || !serviceAccountJson) return null
  try {
    const account = JSON.parse(serviceAccountJson) as Partial<ServiceAccount>
    if (typeof account.client_email !== 'string' || typeof account.private_key !== 'string') return null
    return { projectId, account: { client_email: account.client_email, private_key: account.private_key } }
  } catch {
    return null
  }
}

const encoder = new TextEncoder()

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The DER bytes of a PEM private key. Pasting the JSON can leave its newlines escaped, so both forms are read. */
function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s/g, '')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** The signed JWT a service account trades for an access token (RS256, one hour). */
export async function signedAssertion(account: ServiceAccount, now: number = Date.now()): Promise<string> {
  const issued = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 }))
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claims}`)))
  return `${header}.${claims}.${base64url(signature)}`
}

/** One alert for one app. FCM uses the android block for Android tokens and the apns block for iPhone ones. */
export function fcmMessage(device: PushDevice, payload: PushPayload, now: number = Date.now()) {
  return {
    message: {
      token: device.token,
      notification: { title: payload.title, body: payload.body },
      // Read by the app when the alert is tapped (pushTapPath in src/lib/native.ts).
      data: { url: payload.url, notification_id: payload.tag },
      android: {
        priority: 'HIGH',
        ttl: `${TTL_SECONDS}s`,
        // The tag makes a retry replace the alert rather than repeat it.
        notification: { tag: payload.tag, channel_id: ANDROID_CHANNEL },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(now / 1000) + TTL_SECONDS),
          'apns-collapse-id': payload.tag,
        },
        payload: { aps: { sound: 'default' } },
      },
    },
  }
}

/** The reason FCM gives in an error's details, such as UNREGISTERED or THIRD_PARTY_AUTH_ERROR. */
export function fcmErrorCode(body: unknown): string | null {
  const details = (body as { error?: { details?: { errorCode?: unknown }[] } } | null)?.error?.details
  if (!Array.isArray(details)) return null
  const code = details.find((d) => typeof d?.errorCode === 'string')?.errorCode
  return typeof code === 'string' ? code : null
}

/**
 * Sends to one app at a time. The access token is kept until five minutes
 * before it expires, so a burst of notifications signs in once.
 */
export function fcmSender(config: FcmConfig, fetchFn: Fetch = fetch, clock: () => number = Date.now) {
  let cached: { token: string; until: number } | null = null

  async function accessToken(): Promise<string> {
    const now = clock()
    if (cached && cached.until > now) return cached.token
    const res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await signedAssertion(config.account, now),
      }).toString(),
    })
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!res.ok || !body?.access_token) throw new Error(`FCM sign-in failed (${res.status})`)
    cached = { token: body.access_token, until: now + ((body.expires_in ?? 3600) - 300) * 1000 }
    return cached.token
  }

  return async function send(device: PushDevice, payload: PushPayload): Promise<PushOutcome> {
    const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmMessage(device, payload, clock())),
    })
    if (res.ok) return 'sent'
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const code = fcmErrorCode(body)
    // The app was uninstalled, or its token replaced: forget it.
    if (code === 'UNREGISTERED') return 'gone'
    // Revoked or expired early: sign in again on the next send.
    if (res.status === 401) cached = null
    // Mostly set-up mistakes (a missing APNs key shows as THIRD_PARTY_AUTH_ERROR), so say what FCM said.
    console.error(`FCM refused a push to ${device.platform}: ${res.status} ${code ?? ''} ${body?.error?.message ?? ''}`.replace(/\s+/g, ' ').trim())
    return 'failed'
  }
}
