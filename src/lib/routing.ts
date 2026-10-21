import { distanceKm, type Point } from './distance'
import { bestOrder, MAX_EXACT_STOPS } from '../../supabase/functions/_shared/routeSolver.ts'

/**
 * A stop on a rider's round: collecting an order or handing it over. An
 * order that is already on the bike has only its hand-over left.
 */
export type Stop = Point & { id: string; kind: 'pickup' | 'dropoff'; deliveryId: string; label: string }

/** Total distance of a round, starting from where the rider is. */
export function routeKm(start: Point, stops: Stop[]): number {
  let at: Point = start
  let total = 0
  for (const stop of stops) {
    total += distanceKm(at, stop)
    at = stop
  }
  return total
}

/**
 * The order to visit stops in: the shortest round from where the rider is,
 * with each order collected before it is delivered. Exact (see
 * routeSolver.ts), on straight-line distances; the route-plan Edge Function
 * does the same on road travel times in current traffic when a maps key is
 * set.
 */
export function planStops(start: Point, stops: Stop[]): Stop[] {
  const order = bestOrder(stops.slice(0, MAX_EXACT_STOPS), (from, to) => distanceKm(from === -1 ? start : stops[from], stops[to]))
  return [...order.map((i) => stops[i]), ...stops.slice(MAX_EXACT_STOPS)]
}

/** Turn-by-turn directions in Google Maps for the planned round. Needs no API key: it is an ordinary link. */
export function directionsUrl(start: Point, stops: Stop[]): string | null {
  if (stops.length === 0) return null
  const at = (p: Point) => `${p.lat},${p.lng}`
  const params = new URLSearchParams({ api: '1', origin: at(start), destination: at(stops[stops.length - 1]), travelmode: 'driving' })
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(at).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** "About 25 min", "About 1 hr 10 min". */
export function describeEta(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null
  if (minutes < 60) return `About ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `About ${hours} hr ${rest} min` : `About ${hours} hr`
}
