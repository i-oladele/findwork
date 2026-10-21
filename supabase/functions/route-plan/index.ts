// Plans a rider's round on real roads in current traffic: the quickest order
// of their stops, collecting each parcel before delivering it, with the
// minutes to each stop. Uses Google's Route Matrix for travel times; the
// order itself is worked out exactly (routeSolver.ts).
//
// Without GOOGLE_MAPS_API_KEY it answers not_configured, and the rider's
// screen plans the same way on straight-line distances instead.
//
// Secrets: GOOGLE_MAPS_API_KEY (Routes API enabled)
// Deploy:  supabase functions deploy route-plan
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json, requireEnv } from '../_shared/http.ts'
import { matrixRequest, plan, readMatrix, stopsFor, type DeliveryRow } from './routePlan.ts'

const KM_PER_DEGREE = 111

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'invalid session' }, 401)
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) return json({ error: 'not_configured' }, 503)

  // Read as the rider, so the database decides which deliveries are theirs.
  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } })
  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return json({ error: 'invalid session' }, 401)
  const [{ data: rider }, { data: deliveries, error }] = await Promise.all([
    caller.from('rider_profiles').select('lat, lng, vehicle').eq('id', auth.user.id).maybeSingle(),
    caller.from('deliveries').select('id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
      .eq('rider_id', auth.user.id).in('status', ['assigned', 'picked_up']),
  ])
  if (error) return json({ error: error.message }, 500)
  if (!rider || rider.lat == null || rider.lng == null) return json({ error: 'no_position' }, 400)
  const start = { lat: Number(rider.lat), lng: Number(rider.lng) }
  const stops = stopsFor((deliveries ?? []) as DeliveryRow[])
  if (stops.length === 0) return json({ stops: [], total_minutes: 0, total_km: 0, source: 'routed' })

  const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
    },
    body: JSON.stringify(matrixRequest(start, stops, rider.vehicle)),
  })
  if (!res.ok) {
    console.error('route matrix failed', res.status, await res.text().catch(() => ''))
    return json({ error: 'maps_unavailable' }, 502)
  }
  const matrix = readMatrix(await res.json().catch(() => null), stops.length + 1)
  // A pair Google could not route is counted at 15 km/h, from the straight line.
  const slow = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    (Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * KM_PER_DEGREE / 15) * 3600
  return json({ ...plan(start, stops, matrix, slow), source: 'routed' })
})
