// Replaces a delivery's estimated arrival with a routed, traffic-aware time
// from Google's Routes API. The maps key must never reach the client, so the
// call happens here. Called by the rider's and the customer's tracking screens.
//
//   supabase secrets set GOOGLE_MAPS_API_KEY=...
//   supabase functions deploy route-estimate
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { adminClient, cors, json, requireEnv } from '../_shared/http.ts'
import { estimateRoute } from './routeEstimate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'invalid session' }, 401)
  const body = await req.json().catch(() => ({}))
  const orderId = (body as { orderId?: unknown }).orderId
  if (typeof orderId !== 'string') return json({ error: 'orderId required' }, 400)

  // Read as the caller, so the database decides whether they may see this delivery.
  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = adminClient()
  return estimateRoute({
    apiKey: Deno.env.get('GOOGLE_MAPS_API_KEY'),
    tracking: () => caller.rpc('delivery_tracking', { p_order_id: orderId }),
    route: async (request, apiKey) => {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
        body: JSON.stringify(request),
      })
      return { ok: res.ok, body: await res.json().catch(() => null) }
    },
    store: (deliveryId, minutes) => admin.rpc('set_delivery_route', { p_delivery_id: deliveryId, p_minutes: minutes }),
  })
})
