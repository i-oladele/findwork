import { distanceKm, type Point } from './distance'

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

/** An order is only valid if every parcel is collected before it is delivered. */
function collectsFirst(stops: Stop[]): boolean {
  const collected = new Set<string>()
  const needsPickup = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.deliveryId))
  for (const stop of stops) {
    if (stop.kind === 'pickup') collected.add(stop.deliveryId)
    else if (needsPickup.has(stop.deliveryId) && !collected.has(stop.deliveryId)) return false
  }
  return true
}

/**
 * The order to visit stops in. Starts with the nearest stop that can be done
 * next, then keeps swapping pairs while that shortens the round. With the
 * handful of orders a rider carries this finds the best order or very close
 * to it. Distances are straight lines: it does not know about one-way
 * streets, bridges or traffic.
 */
export function planStops(start: Point, stops: Stop[]): Stop[] {
  const remaining = [...stops]
  const collected = new Set<string>()
  const needsPickup = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.deliveryId))
  const order: Stop[] = []
  let at: Point = start
  while (remaining.length > 0) {
    let best = -1
    let bestKm = Infinity
    remaining.forEach((stop, i) => {
      const ready = stop.kind === 'pickup' || !needsPickup.has(stop.deliveryId) || collected.has(stop.deliveryId)
      const km = distanceKm(at, stop)
      if (ready && km < bestKm) {
        best = i
        bestKm = km
      }
    })
    const [next] = remaining.splice(best, 1)
    if (next.kind === 'pickup') collected.add(next.deliveryId)
    order.push(next)
    at = next
  }

  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const swapped = [...order]
        ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
        if (collectsFirst(swapped) && routeKm(start, swapped) < routeKm(start, order) - 1e-9) {
          order.splice(0, order.length, ...swapped)
          improved = true
        }
      }
    }
  }
  return order
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
