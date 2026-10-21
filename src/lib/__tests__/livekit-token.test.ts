import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { joinGrant, serverUrl, signToken } from '../../../supabase/functions/livekit-token/livekitToken.ts'

/**
 * A token is the whole of a viewer's or seller's permission in a stream's
 * room, so its signature and grant are checked exactly.
 */
const decode = (part: string) => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())

describe('LiveKit tokens', () => {
  it('signs a JWT LiveKit can verify with the API secret', async () => {
    const token = await signToken('APIkey123', 'secret-of-at-least-32-characters-long', {
      identity: 'user-1', name: 'Ada', ttlSeconds: 3600, video: joinGrant('stream-abc', false),
    }, 1_760_000_000_000)
    const [header, payload, signature] = token.split('.')
    const expected = createHmac('sha256', 'secret-of-at-least-32-characters-long').update(`${header}.${payload}`).digest('base64url')
    expect(signature).toBe(expected)
    expect(decode(header)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decode(payload)).toEqual({
      iss: 'APIkey123', sub: 'user-1', name: 'Ada', nbf: 1_760_000_000, exp: 1_760_003_600,
      video: { room: 'stream-abc', roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false },
    })
  })

  it('lets the seller publish only camera and microphone', () => {
    expect(joinGrant('stream-abc', true)).toEqual({
      room: 'stream-abc', roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: ['camera', 'microphone'],
    })
  })

  it('turns the client address into the server API address', () => {
    expect(serverUrl('wss://findwork.livekit.cloud/')).toBe('https://findwork.livekit.cloud')
    expect(serverUrl('ws://localhost:7880')).toBe('http://localhost:7880')
  })
})
