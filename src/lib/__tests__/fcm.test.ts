import { createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ANDROID_CHANNEL, fcmConfig, fcmErrorCode, fcmMessage, fcmSender, signedAssertion } from '../../../supabase/functions/send-push/fcm.ts'
import { pushPayload } from '../../../supabase/functions/send-push/pushPayload.ts'

/**
 * Pushes to the phone apps go through FCM's HTTP v1 API, signed in as a
 * service account. The sign-in, the message and how FCM's answers are read
 * are checked without the network.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const account = { client_email: 'push@findwork-app.iam.gserviceaccount.com', private_key: privateKey }
const config = { projectId: 'findwork-app', account }
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())
const payload = pushPayload({ id: 'n1', kind: 'order', title: 'Order on its way', body: 'Ada is bringing it', created_at: '', read_at: null })
const android = { token: 'android-token', platform: 'android' as const }
const NOW = 1_760_000_000_000

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const unregisteredReply = () => reply(404, {
  error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] },
})
/** Answers the sign-in, then each send with the next reply given. */
function fakeGoogle(...sends: Response[]) {
  return vi.fn(async (url: string, _init: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') return reply(200, { access_token: 'access-1', expires_in: 3599, token_type: 'Bearer' })
    return sends.shift() ?? reply(200, { name: 'projects/findwork-app/messages/1' })
  })
}

describe('FCM for the phone apps', () => {
  it('is set up only when both secrets are there and the key is a service account key', () => {
    expect(fcmConfig('findwork-app', JSON.stringify(account))).toEqual(config)
    expect(fcmConfig(undefined, JSON.stringify(account))).toBeNull()
    expect(fcmConfig('findwork-app', undefined)).toBeNull()
    expect(fcmConfig('findwork-app', 'not json')).toBeNull()
    expect(fcmConfig('findwork-app', JSON.stringify({ type: 'service_account' }))).toBeNull()
  })

  it('signs in with an RS256 assertion Google can verify with the account\'s public key', async () => {
    const [header, claims, signature] = (await signedAssertion(account, NOW)).split('.')
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decode(claims)).toEqual({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    })
    expect(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url')).toBe(true)
  })

  it('reads a key whose newlines were left escaped when the JSON was pasted', async () => {
    const escaped = { ...account, private_key: privateKey.replace(/\n/g, '\\n') }
    const [header, claims, signature] = (await signedAssertion(escaped, NOW)).split('.')
    expect(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url')).toBe(true)
  })

  it('sends the alert, and where a tap should take the app', () => {
    const { message } = fcmMessage(android, payload, NOW)
    expect(message.token).toBe('android-token')
    expect(message.notification).toEqual({ title: 'Order on its way', body: 'Ada is bringing it' })
    expect(message.data).toEqual({ url: '/notifications?open=n1', notification_id: 'n1' })
    expect(message.android).toEqual({ priority: 'HIGH', ttl: '900s', notification: { tag: 'n1', channel_id: ANDROID_CHANNEL } })
    expect(message.apns.headers).toEqual({ 'apns-priority': '10', 'apns-expiration': String(NOW / 1000 + 900), 'apns-collapse-id': 'n1' })
  })

  it('signs in once for a run of pushes', async () => {
    const fetchFn = fakeGoogle()
    const send = fcmSender(config, fetchFn, () => NOW)
    expect(await send(android, payload)).toBe('sent')
    expect(await send({ token: 'iphone-token', platform: 'ios' }, payload)).toBe('sent')
    const urls = fetchFn.mock.calls.map(([url]) => url)
    expect(urls.filter((u) => u.includes('oauth2'))).toHaveLength(1)
    expect(urls.filter((u) => u === 'https://fcm.googleapis.com/v1/projects/findwork-app/messages:send')).toHaveLength(2)
    const [, init] = fetchFn.mock.calls[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
    expect(JSON.parse(init.body as string).message.token).toBe('android-token')
  })

  it('signs in again once the access token is close to expiring, or is refused', async () => {
    let now = NOW
    const fetchFn = fakeGoogle(reply(200, {}), reply(401, { error: { status: 'UNAUTHENTICATED' } }), reply(200, {}), reply(200, {}))
    const send = fcmSender(config, fetchFn, () => now)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await send(android, payload)
    expect(await send(android, payload)).toBe('failed')
    await send(android, payload)
    now += 56 * 60_000
    await send(android, payload)
    expect(fetchFn.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(3)
  })

  it('reports an app FCM no longer knows as gone, and anything else as a failure to retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = fcmSender(config, fakeGoogle(
      unregisteredReply(),
      reply(404, { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }),
      reply(503, { error: { status: 'UNAVAILABLE' } }),
      reply(401, { error: { details: [{ errorCode: 'THIRD_PARTY_AUTH_ERROR' }] } }),
    ), () => NOW)
    expect(await send(android, payload)).toBe('gone')
    expect(await send(android, payload)).toBe('failed')
    expect(await send(android, payload)).toBe('failed')
    expect(await send({ token: 'iphone-token', platform: 'ios' }, payload)).toBe('failed')
    expect(console.error).toHaveBeenLastCalledWith('FCM refused a push to ios: 401 THIRD_PARTY_AUTH_ERROR')
  })

  it('fails the push, not the whole run, when signing in fails', async () => {
    const fetchFn = vi.fn(async () => reply(400, { error: 'invalid_grant' }))
    await expect(fcmSender(config, fetchFn, () => NOW)(android, payload)).rejects.toThrow('FCM sign-in failed (400)')
  })

  it('finds FCM\'s reason among the error details', () => {
    expect(fcmErrorCode({ error: { details: [{ '@type': 'x' }, { errorCode: 'UNREGISTERED' }] } })).toBe('UNREGISTERED')
    expect(fcmErrorCode({ error: { status: 'NOT_FOUND' } })).toBeNull()
    expect(fcmErrorCode(null)).toBeNull()
  })
})
