/**
 * Planning a rider's round on real roads. Kept free of Deno imports so it
 * can be unit-tested from Vitest.
 *
 * Google's Route Matrix gives the travel time between every pair of points
 * (the rider and each stop) in current traffic; bestOrder then finds the
 * quickest order that collects each parcel before delivering it.
 */
import { bestOrder, MAX_EXACT_STOPS } from '../_shared/routeSolver.ts'

type LatLng = { lat: number; lng: number }
export type PlanStop = LatLng & { id: string; kind: 'pickup' | 'dropoff'; deliveryId: string }

export type DeliveryRow = {
  id: string; status: string
  pickup_lat: number | string | null; pickup_lng: number | string | null
  dropoff_lat: number | string | null; dropoff_lng: number | string | null
}

/** The stops left on a rider's deliveries: a pickup until it is collected, then the drop-off. */
export function stopsFor(deliveries: DeliveryRow[]): PlanStop[] {
  return deliveries.flatMap((d) => {
    const list: PlanStop[] = []
    if (d.status === 'assigned' && d.pickup_lat != null && d.pickup_lng != null) {
      list.push({ id: `${d.id}:pickup`, kind: 'pickup', deliveryId: d.id, lat: Number(d.pickup_lat), lng: Number(d.pickup_lng) })
    }
    if (d.dropoff_lat != null && d.dropoff_lng != null) {
      list.push({ id: `${d.id}:dropoff`, kind: 'dropoff', deliveryId: d.id, lat: Number(d.dropoff_lat), lng: Number(d.dropoff_lng) })
    }
    return list
  }).slice(0, MAX_EXACT_STOPS)
}

export const MODE: Record<string, string> = { bicycle: 'BICYCLE', motorcycle: 'TWO_WHEELER', car: 'DRIVE', van: 'DRIVE' }

/** The Route Matrix request for the rider (point 0) and every stop. */
export function matrixRequest(start: LatLng, stops: PlanStop[], vehicle: string) {
  const points = [start, ...stops].map((p) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } }))
  const travelMode = MODE[vehicle] ?? 'DRIVE'
  return { origins: points, destinations: points, travelMode, ...(travelMode === 'BICYCLE' ? {} : { routingPreference: 'TRAFFIC_AWARE' }) }
}

type Element = { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string }

/** Seconds between every pair of points; null where Google found no route. */
export function readMatrix(body: unknown, size: number): { seconds: (number | null)[][]; meters: (number | null)[][] } {
  const seconds = Array.from({ length: size }, () => Array<number | null>(size).fill(null))
  const meters = Array.from({ length: size }, () => Array<number | null>(size).fill(null))
  for (const e of (Array.isArray(body) ? body : []) as Element[]) {
    const i = e.originIndex ?? 0
    const j = e.destinationIndex ?? 0
    if (i >= size || j >= size || e.condition === 'ROUTE_NOT_FOUND') continue
    const s = typeof e.duration === 'string' ? Number(e.duration.replace(/s$/, '')) : NaN
    if (Number.isFinite(s)) seconds[i][j] = s
    if (typeof e.distanceMeters === 'number') meters[i][j] = e.distanceMeters
  }
  for (let i = 0; i < size; i++) { seconds[i][i] = 0; meters[i][i] = 0 }
  return { seconds, meters }
}

export type Plan = { stops: { id: string; minutes: number }[]; total_minutes: number; total_km: number | null }

/**
 * The quickest order, with the minutes from now to each stop. A pair Google
 * could not route is counted at a slow city pace from the straight-line
 * distance (fallbackSeconds), so it is used only when nothing quicker is.
 */
export function plan(start: LatLng, stops: PlanStop[], matrix: ReturnType<typeof readMatrix>, fallbackSeconds: (a: LatLng, b: LatLng) => number): Plan {
  const points = [start, ...stops]
  const seconds = (from: number, to: number) => matrix.seconds[from + 1][to + 1] ?? fallbackSeconds(points[from + 1], points[to + 1])
  const order = bestOrder(stops, seconds)
  let at = -1
  let elapsed = 0
  let meters: number | null = 0
  const result = order.map((k) => {
    elapsed += seconds(at, k)
    const leg = matrix.meters[at + 1][k + 1]
    meters = leg == null || meters == null ? null : meters + leg
    at = k
    return { id: stops[k].id, minutes: Math.ceil(elapsed / 60) }
  })
  return { stops: result, total_minutes: Math.ceil(elapsed / 60), total_km: meters == null ? null : Math.round((meters as number) / 100) / 10 }
}
