/**
 * Asks Google's Routes API how long a delivery will take in current traffic.
 * Kept free of Deno imports so it can be unit-tested from Vitest.
 *
 * Without GOOGLE_MAPS_API_KEY the function reports that it is not set up and
 * the app keeps the database's own estimate (distance, vehicle, time of day).
 */
import { json } from '../_shared/cors.ts'

type LatLng = { lat: number; lng: number }

export type Tracking = {
  id: string
  status: string
  pickup_lat: number | null; pickup_lng: number | null
  dropoff_lat: number | null; dropoff_lng: number | null
  rider: { lat: number | null; lng: number | null; vehicle: string } | null
}

const MODE: Record<string, string> = { bicycle: 'BICYCLE', motorcycle: 'TWO_WHEELER', car: 'DRIVE', van: 'DRIVE' }
const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })

/** The request body, or null when there are not enough known points to route between. */
export function routeRequest(t: Tracking) {
  if (!t.rider || t.rider.lat == null || t.rider.lng == null || t.dropoff_lat == null || t.dropoff_lng == null) return null
  if (t.status !== 'assigned' && t.status !== 'picked_up') return null
  const viaPickup = t.status === 'assigned' && t.pickup_lat != null && t.pickup_lng != null
  return {
    origin: waypoint({ lat: t.rider.lat, lng: t.rider.lng }),
    destination: waypoint({ lat: t.dropoff_lat, lng: t.dropoff_lng }),
    ...(viaPickup ? { intermediates: [waypoint({ lat: t.pickup_lat!, lng: t.pickup_lng! })] } : {}),
    travelMode: MODE[t.rider.vehicle] ?? 'DRIVE',
    ...(t.rider.vehicle === 'bicycle' ? {} : { routingPreference: 'TRAFFIC_AWARE' }),
  }
}

/** "1234s" from the API, as whole minutes; ten more when the order still has to be collected. */
export function routedMinutes(duration: unknown, collecting: boolean): number | null {
  const seconds = typeof duration === 'string' ? Number(duration.replace(/s$/, '')) : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.min(1440, Math.ceil(seconds / 60) + (collecting ? 10 : 0))
}

export type EstimateSteps = {
  apiKey: string | undefined
  tracking: () => PromiseLike<{ data: unknown; error: { message: string } | null }>
  route: (body: unknown, apiKey: string) => Promise<{ ok: boolean; body: unknown }>
  store: (deliveryId: string, minutes: number) => PromiseLike<{ error: { message: string } | null }>
}

export async function estimateRoute(steps: EstimateSteps): Promise<Response> {
  if (!steps.apiKey) return json({ configured: false })
  const tracked = await steps.tracking()
  // delivery_tracking refuses anyone who is not on this delivery.
  if (tracked.error || !tracked.data) return json({ error: 'delivery not found' }, 404)
  const tracking = tracked.data as Tracking
  const request = routeRequest(tracking)
  if (!request) return json({ configured: true, routed: false })
  const answer = await steps.route(request, steps.apiKey)
  const duration = (answer.body as { routes?: { duration?: string }[] } | null)?.routes?.[0]?.duration
  const minutes = answer.ok ? routedMinutes(duration, tracking.status === 'assigned') : null
  if (minutes === null) return json({ configured: true, routed: false })
  const stored = await steps.store(tracking.id, minutes)
  if (stored.error) return json({ error: 'could not save the estimate' }, 500)
  return json({ configured: true, routed: true, minutes })
}
