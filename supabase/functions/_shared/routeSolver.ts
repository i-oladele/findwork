/**
 * The best order to visit a rider's stops: the one that takes least time
 * (or distance) from where they are, with every parcel collected before it
 * is handed over. Exact, not a rule of thumb: it weighs every valid order,
 * by working out the cheapest way to have done each set of stops and ending
 * at each one (dynamic programming over subsets). With the handful of
 * orders a rider carries this takes a few milliseconds.
 *
 * Used by the route-plan Edge Function with road travel times in current
 * traffic, and by the rider's screen with straight-line distances when no
 * maps key is set. Kept free of Deno and browser imports.
 */

export type StopNode = { kind: 'pickup' | 'dropoff'; deliveryId: string }

/** More stops than this are planned by the caller some other way. */
export const MAX_EXACT_STOPS = 14

/**
 * Indexes into `stops`, in visiting order. `cost(from, to)` is the time or
 * distance between two stops, where `from` is -1 for the rider's position.
 * A drop-off whose pickup is not in the list (the parcel is already on the
 * bike) can come at any point.
 */
export function bestOrder(stops: StopNode[], cost: (from: number, to: number) => number): number[] {
  const n = stops.length
  if (n === 0) return []
  if (n > MAX_EXACT_STOPS) throw new Error(`at most ${MAX_EXACT_STOPS} stops can be planned exactly`)
  const pickupOf = stops.map((s) => (s.kind === 'dropoff' ? stops.findIndex((p) => p.kind === 'pickup' && p.deliveryId === s.deliveryId) : -1))
  const states = 1 << n
  const best = new Float64Array(states * n).fill(Infinity)
  const came = new Int16Array(states * n).fill(-1)
  for (let j = 0; j < n; j++) if (pickupOf[j] === -1) best[(1 << j) * n + j] = cost(-1, j)

  for (let mask = 1; mask < states; mask++) {
    for (let j = 0; j < n; j++) {
      const here = best[mask * n + j]
      if (!(mask & (1 << j)) || !Number.isFinite(here)) continue
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue
        if (pickupOf[k] !== -1 && !(mask & (1 << pickupOf[k]))) continue
        const next = mask | (1 << k)
        const total = here + cost(j, k)
        if (total < best[next * n + k]) {
          best[next * n + k] = total
          came[next * n + k] = j
        }
      }
    }
  }

  const full = states - 1
  let end = 0
  for (let j = 1; j < n; j++) if (best[full * n + j] < best[full * n + end]) end = j
  const order: number[] = []
  for (let mask = full, j = end; j !== -1;) {
    order.push(j)
    const previous = came[mask * n + j]
    mask &= ~(1 << j)
    j = previous
  }
  return order.reverse()
}
