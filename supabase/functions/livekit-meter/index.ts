// The live video meter, run every minute by the database (pg_cron, through
// private.request_live_video_tick) while a FindWork video room could be open.
//
// Asks LiveKit which rooms are open and how many people are in each, hands
// that to public.live_video_tick (which records the minute and applies the
// fair-use limits), then closes the rooms it names. Counting on the server,
// from LiveKit itself, means a changed app cannot dodge the limits.
//
// Secrets: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_HOOK_SECRET
//          (the same value as the livekit_hook_secret settings row; npm run
//          secrets:push writes both)
// Deploy:  supabase functions deploy livekit-meter --no-verify-jwt
import { adminClient, json } from '../_shared/http.ts'
import { hookSecretMatches } from '../_shared/payments.ts'
import { serverGrant, serverUrl, signToken } from '../livekit-token/livekitToken.ts'
import { runMeter } from './meter.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!hookSecretMatches(req.headers.get('x-livekit-hook-secret'), Deno.env.get('LIVEKIT_HOOK_SECRET'))) {
    return json({ error: 'unauthorised' }, 401)
  }
  const url = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!url || !apiKey || !apiSecret) return json({ error: 'not_configured' }, 503)

  const api = serverUrl(url)
  const call = async (method: 'ListRooms' | 'DeleteRoom', body: Record<string, unknown>, grant: ReturnType<typeof serverGrant>) => {
    const token = await signToken(apiKey, apiSecret, { identity: 'findwork-meter', ttlSeconds: 60, video: grant })
    return fetch(`${api}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  const admin = adminClient()

  try {
    const result = await runMeter({
      listRooms: async () => {
        const res = await call('ListRooms', {}, serverGrant('list'))
        if (!res.ok) throw new Error(`LiveKit ListRooms answered ${res.status}`)
        return res.json()
      },
      tick: async (rooms) => {
        const { data, error } = await admin.rpc('live_video_tick', { p_rooms: rooms })
        if (error) throw new Error(error.message)
        return (data ?? {}) as { close?: unknown }
      },
      // A room that already emptied and closed itself is gone too.
      deleteRoom: async (room) => {
        const res = await call('DeleteRoom', { room }, serverGrant('delete', room))
        return res.ok || res.status === 404
      },
    })
    if (result.failed.length > 0) console.error(`live video meter could not close: ${result.failed.join(', ')}`)
    return json(result)
  } catch (err) {
    console.error('live video meter failed', err)
    return json({ error: (err as Error).message }, 502)
  }
})
