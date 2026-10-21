import { describe, expect, it } from 'vitest'
import { bestOrder, type StopNode } from '../../../supabase/functions/_shared/routeSolver.ts'
import { matrixRequest, plan, readMatrix, stopsFor } from '../../../supabase/functions/route-plan/routePlan.ts'

/** Every valid order, tried one by one: the solver must match the best of them. */
function bruteForce(stops: StopNode[], cost: (a: number, b: number) => number): number {
  let best = Infinity
  const visit = (order: number[], done: Set<number>) => {
    if (order.length === stops.length) {
      let total = 0
      order.forEach((k, i) => { total += cost(i === 0 ? -1 : order[i - 1], k) })
      best = Math.min(best, total)
      return
    }
    stops.forEach((s, k) => {
      if (done.has(k)) return
      const pickup = stops.findIndex((p) => p.kind === 'pickup' && p.deliveryId === s.deliveryId)
      if (s.kind === 'dropoff' && pickup !== -1 && !done.has(pickup)) return
      visit([...order, k], new Set([...done, k]))
    })
  }
  visit([], new Set())
  return best
}

describe('the exact route solver', () => {
  it('finds the best valid order, whatever the travel times', () => {
    // A fixed pseudo-random table, so the test is the same every run.
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let round = 0; round < 25; round++) {
      const stops: StopNode[] = [
        { kind: 'pickup', deliveryId: 'a' }, { kind: 'dropoff', deliveryId: 'a' },
        { kind: 'pickup', deliveryId: 'b' }, { kind: 'dropoff', deliveryId: 'b' },
        { kind: 'dropoff', deliveryId: 'c' },
      ]
      const table = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 1 + Math.floor(rand() * 60)))
      const cost = (a: number, b: number) => table[a + 1][b + 1]
      const order = bestOrder(stops, cost)
      let total = 0
      order.forEach((k, i) => { total += cost(i === 0 ? -1 : order[i - 1], k) })
      expect(total).toBe(bruteForce(stops, cost))
      expect(order.indexOf(0)).toBeLessThan(order.indexOf(1))
      expect(order.indexOf(2)).toBeLessThan(order.indexOf(3))
    }
  })
})

describe('planning on real roads', () => {
  const start = { lat: 6.5, lng: 3.35 }
  const deliveries = [
    { id: 'a', status: 'assigned', pickup_lat: '6.6', pickup_lng: '3.4', dropoff_lat: '6.45', dropoff_lng: '3.3' },
    { id: 'b', status: 'picked_up', pickup_lat: '6.7', pickup_lng: '3.5', dropoff_lat: '6.52', dropoff_lng: '3.36' },
  ]

  it('collects only what is still to be collected', () => {
    expect(stopsFor(deliveries).map((s) => s.id)).toEqual(['a:pickup', 'a:dropoff', 'b:dropoff'])
  })

  it('asks for traffic-aware times between every pair, except by bicycle', () => {
    const stops = stopsFor(deliveries)
    const request = matrixRequest(start, stops, 'motorcycle')
    expect(request).toMatchObject({ travelMode: 'TWO_WHEELER', routingPreference: 'TRAFFIC_AWARE' })
    expect(request.origins).toHaveLength(4)
    expect(matrixRequest(start, stops, 'bicycle')).not.toHaveProperty('routingPreference')
  })

  it('orders the round by road time, with minutes to each stop', () => {
    const stops = stopsFor(deliveries)
    // Points: 0 rider, 1 a:pickup, 2 a:dropoff, 3 b:dropoff. b's customer is 5 minutes away by road.
    const minutes = [
      [0, 20, 30, 5],
      [20, 0, 25, 22],
      [30, 25, 0, 28],
      [5, 18, 27, 0],
    ]
    const body = minutes.flatMap((row, i) => row.map((m, j) => ({ originIndex: i, destinationIndex: j, duration: `${m * 60}s`, distanceMeters: m * 400, condition: 'ROUTE_EXISTS' })))
    const result = plan(start, stops, readMatrix(body, 4), () => 9999)
    expect(result.stops).toEqual([{ id: 'b:dropoff', minutes: 5 }, { id: 'a:pickup', minutes: 23 }, { id: 'a:dropoff', minutes: 48 }])
    expect(result.total_minutes).toBe(48)
    expect(result.total_km).toBe(19.2)
  })

  it('avoids a pair Google could not route when another way exists', () => {
    const stops = stopsFor(deliveries)
    const body = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => (i === 0 && j === 3
      ? { originIndex: 0, destinationIndex: 3, condition: 'ROUTE_NOT_FOUND' }
      : { originIndex: i, destinationIndex: j, duration: `${(i + j) * 300}s`, condition: 'ROUTE_EXISTS' })))
    const matrix = readMatrix(body, 4)
    expect(matrix.seconds[0][3]).toBeNull()
    expect(plan(start, stops, matrix, () => 99_999).stops[0].id).not.toBe('b:dropoff')
  })
})
