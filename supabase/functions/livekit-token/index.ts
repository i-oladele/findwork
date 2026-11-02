// Lets people into a live stream's video room, through LiveKit.
//
//   { action: 'status' }              whether FindWork Live is set up
//   { action: 'join', stream_id }     a token for the room: the seller may
//                                     broadcast their camera; anyone else
//                                     may only watch, and only while live
//   { action: 'close', stream_id }    the seller, once the stream has ended:
//                                     closes the room, so nobody lingers
//
// The database decides who may join (public.stream_access); this function
// only signs what it allows.
//
// Secrets: LIVEKIT_URL (wss://<project>.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET
// Deploy:  supabase functions deploy livekit-token
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { joinGrant, serverGrant, serverUrl, signToken } from './livekitToken.ts'

type Access = { room: string; publish: boolean; status: string; name: string | null }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)

  const url = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  const configured = Boolean(url && apiKey && apiSecret)
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; stream_id?: unknown }
  if (body.action === 'status') return json({ configured })
  if (!configured) return json({ error: 'not_configured' }, 503)
  if (typeof body.stream_id !== 'string') return json({ error: 'stream_id required' }, 400)

  const admin = adminClient()
  if (body.action === 'join') {
    const { data, error } = await admin.rpc('stream_access', { p_stream_id: body.stream_id, p_profile_id: user.id })
    if (error) return json({ error: error.message }, 500)
    const access = data as (Access & { denied?: string }) | null
    if (!access) return json({ error: 'stream_not_open' }, 403)
    // A fair-use limit (live_video_tick): the app says which, and offers the link option.
    if (access.denied) return json({ error: 'video_limit', reason: access.denied }, 403)
    const token = await signToken(apiKey!, apiSecret!, {
      identity: user.id,
      name: access.name ?? undefined,
      // Long enough for a sale; a viewer who stays longer simply rejoins.
      ttlSeconds: access.publish ? 4 * 3600 : 2 * 3600,
      video: joinGrant(access.room, access.publish),
    })
    return json({ url, token, publish: access.publish })
  }

  if (body.action === 'close') {
    const { data: stream } = await admin.from('live_streams').select('id, seller_id, status, video').eq('id', body.stream_id).maybeSingle()
    if (!stream || stream.seller_id !== user.id || stream.video !== 'livekit') return json({ error: 'stream not found' }, 404)
    if (stream.status !== 'ended') return json({ error: 'stream is still open' }, 400)
    const room = `stream-${stream.id}`
    // Deleting a room needs roomCreate; roomAdmin alone is refused.
    const token = await signToken(apiKey!, apiSecret!, { identity: 'findwork-server', ttlSeconds: 60, video: serverGrant('delete', room) })
    const res = await fetch(`${serverUrl(url!)}/twirp/livekit.RoomService/DeleteRoom`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
    })
    // A room that already emptied and closed itself is fine.
    if (!res.ok && res.status !== 404) return json({ error: 'room could not be closed' }, 502)
    return json({ closed: true })
  }

  return json({ error: 'invalid_action' }, 400)
})
