/**
 * LiveKit access tokens: HS256 JWTs signed with the project's API secret,
 * carrying a "video" grant that says which room the holder may join and
 * whether they may publish (https://docs.livekit.io/home/get-started/authentication/).
 * Kept free of Deno imports so it can be unit-tested from Vitest.
 */

export type VideoGrant = {
  room: string
  roomJoin?: boolean
  roomAdmin?: boolean
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  canPublishSources?: ('camera' | 'microphone' | 'screen_share' | 'screen_share_audio')[]
}

const encoder = new TextEncoder()

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signToken(
  apiKey: string,
  apiSecret: string,
  claims: { identity: string; name?: string; ttlSeconds: number; video: VideoGrant },
  now: number = Date.now(),
): Promise<string> {
  const issued = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: apiKey,
    sub: claims.identity,
    ...(claims.name ? { name: claims.name } : {}),
    nbf: issued,
    exp: issued + claims.ttlSeconds,
    video: claims.video,
  }))
  const key = await crypto.subtle.importKey('raw', encoder.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`)))
  return `${header}.${payload}.${base64url(signature)}`
}

/** The grant for one person in one stream's room: the seller broadcasts their camera; viewers only watch. */
export function joinGrant(room: string, publish: boolean): VideoGrant {
  return publish
    ? { room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: ['camera', 'microphone'] }
    : { room, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false }
}

/** wss://project.livekit.cloud → https://project.livekit.cloud, for the server API. */
export function serverUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '')
}
