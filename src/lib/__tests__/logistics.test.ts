import { describe, expect, it, vi } from 'vitest'
import { describeEta, directionsUrl, planStops, routeKm, type Stop } from '../routing'
import { estimateRoute, routedMinutes, routeRequest, type Tracking } from '../../../supabase/functions/route-estimate/routeEstimate.ts'

const start = { lat: 6.5, lng: 3.35 }
const stop = (id: string, kind: Stop['kind'], deliveryId: string, lat: number, lng: number): Stop => ({ id, kind, deliveryId, lat, lng, label: id })

describe('planning a rider\'s stops', () => {
  it('never delivers an order before collecting it, even when the customer is nearer', () => {
    const plan = planStops(start, [stop('drop-a', 'dropoff', 'a', 6.501, 3.351), stop('pick-a', 'pickup', 'a', 6.56, 3.4)])
    expect(plan.map((s) => s.id)).toEqual(['pick-a', 'drop-a'])
  })

  it('delivers what is already on the bike on the way to the next collection', () => {
    const plan = planStops(start, [
      stop('pick-b', 'pickup', 'b', 6.56, 3.35),
      stop('drop-b', 'dropoff', 'b', 6.6, 3.35),
      stop('drop-a', 'dropoff', 'a', 6.52, 3.35), // already collected: no pickup stop
    ])
    expect(plan.map((s) => s.id)).toEqual(['drop-a', 'pick-b', 'drop-b'])
  })

  it('is never longer than visiting the stops in the order given, when that order is valid', () => {
    const stops = [
      stop('pick-a', 'pickup', 'a', 6.6, 3.45), stop('drop-a', 'dropoff', 'a', 6.45, 3.3),
      stop('pick-b', 'pickup', 'b', 6.46, 3.31), stop('drop-b', 'dropoff', 'b', 6.61, 3.44),
    ]
    const plan = planStops(start, stops)
    expect(routeKm(start, plan)).toBeLessThanOrEqual(routeKm(start, stops) + 1e-9)
    expect(plan).toHaveLength(4)
    for (const id of ['a', 'b']) {
      expect(plan.findIndex((s) => s.id === `pick-${id}`)).toBeLessThan(plan.findIndex((s) => s.id === `drop-${id}`))
    }
  })

  it('links to directions through every stop, ending at the last', () => {
    const plan = [stop('pick-a', 'pickup', 'a', 6.6, 3.45), stop('drop-a', 'dropoff', 'a', 6.45, 3.3)]
    const url = new URL(directionsUrl(start, plan)!)
    expect(url.searchParams.get('origin')).toBe('6.5,3.35')
    expect(url.searchParams.get('destination')).toBe('6.45,3.3')
    expect(url.searchParams.get('waypoints')).toBe('6.6,3.45')
    expect(directionsUrl(start, [])).toBeNull()
  })

  it('words an arrival time the way a person would', () => {
    expect(describeEta(25)).toBe('About 25 min')
    expect(describeEta(70)).toBe('About 1 hr 10 min')
    expect(describeEta(120)).toBe('About 2 hr')
    expect(describeEta(null)).toBeNull()
    expect(describeEta(0)).toBeNull()
  })
})

const tracking = (over: Partial<Tracking> = {}): Tracking => ({
  id: 'd1', status: 'assigned', pickup_lat: 6.51, pickup_lng: 3.37, dropoff_lat: 6.45, dropoff_lng: 3.39,
  rider: { lat: 6.52, lng: 3.37, vehicle: 'motorcycle' }, ...over,
})

describe('routed arrival times', () => {
  it('routes through the seller until the order is collected, then straight to the customer', () => {
    expect(routeRequest(tracking())).toMatchObject({ travelMode: 'TWO_WHEELER', routingPreference: 'TRAFFIC_AWARE', intermediates: [expect.anything()] })
    expect(routeRequest(tracking({ status: 'picked_up' }))).not.toHaveProperty('intermediates')
  })

  it('has nothing to route without a rider position or a delivery point', () => {
    expect(routeRequest(tracking({ rider: { lat: null, lng: null, vehicle: 'car' } }))).toBeNull()
    expect(routeRequest(tracking({ dropoff_lat: null }))).toBeNull()
    expect(routeRequest(tracking({ status: 'delivered' }))).toBeNull()
  })

  it('reads the duration and allows time to collect', () => {
    expect(routedMinutes('1500s', false)).toBe(25)
    expect(routedMinutes('1500s', true)).toBe(35)
    expect(routedMinutes(undefined, false)).toBeNull()
    expect(routedMinutes('0s', false)).toBeNull()
  })

  const steps = (over = {}) => ({
    apiKey: 'key' as string | undefined,
    tracking: vi.fn(async () => ({ data: tracking(), error: null })),
    route: vi.fn(async () => ({ ok: true, body: { routes: [{ duration: '1200s' }] } })),
    store: vi.fn(async () => ({ error: null })),
    ...over,
  })

  it('does nothing, and says so, when no maps key is configured', async () => {
    const s = steps({ apiKey: undefined })
    expect(await (await estimateRoute(s)).json()).toEqual({ configured: false })
    expect(s.route).not.toHaveBeenCalled()
  })

  it('stores a routed time for someone on the delivery', async () => {
    const s = steps()
    expect(await (await estimateRoute(s)).json()).toEqual({ configured: true, routed: true, minutes: 30 })
    expect(s.store).toHaveBeenCalledWith('d1', 30)
  })

  it('refuses someone the database will not show the delivery to', async () => {
    const s = steps({ tracking: vi.fn(async () => ({ data: null, error: { message: 'order not found' } })) })
    expect((await estimateRoute(s)).status).toBe(404)
    expect(s.route).not.toHaveBeenCalled()
  })

  it('keeps the existing estimate when the maps service fails', async () => {
    const s = steps({ route: vi.fn(async () => ({ ok: false, body: null })) })
    expect(await (await estimateRoute(s)).json()).toEqual({ configured: true, routed: false })
    expect(s.store).not.toHaveBeenCalled()
  })
})
