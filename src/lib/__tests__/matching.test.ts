import { describe, expect, it } from 'vitest'
import { routePattern } from '../tracking'
import { anomalies, forecast, project } from '../forecast'
import { explainMatch } from '../api/matching'

describe('recording a screen by its kind', () => {
  it('replaces whose profile, order or thread it was', () => {
    expect(routePattern('/provider/8f3c2a10-1234-4abc-9def-001122334455')).toBe('/provider/:id')
    expect(routePattern('/book/8f3c2a10-1234-4abc-9def-001122334455/time')).toBe('/book/:id/time')
    expect(routePattern('/product/ankara-wax-print')).toBe('/product/:id')
    expect(routePattern('/chat/with/8f3c2a10-1234-4abc-9def-001122334455')).toBe('/chat/with/:id')
    expect(routePattern('/order/8f3c2a10-1234-4abc-9def-001122334455')).toBe('/order/:id')
  })

  it('keeps screens that are not about one thing', () => {
    expect(routePattern('/provider/jobs')).toBe('/provider/jobs')
    expect(routePattern('/wallet/transfer')).toBe('/wallet/transfer')
    expect(routePattern('/checkout')).toBe('/checkout')
    expect(routePattern('/classifieds/new')).toBe('/classifieds/new')
    expect(routePattern('/provider/jobs/8f3c2a10-1234-4abc-9def-001122334455/quote')).toBe('/provider/jobs/:id/quote')
  })
})

describe('projecting from recent history', () => {
  const days = (values: number[]) => values.map((value, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), value }))

  it('needs two weeks before it says anything', () => {
    expect(project(days([1, 2, 3, 4, 5, 6, 7]))).toBeNull()
  })

  it('continues a steady rise', () => {
    const next = project(days(Array.from({ length: 21 }, (_, i) => 1000 + i * 100)))!
    expect(next).toHaveLength(7)
    expect(next[0].date).toBe('2026-09-22')
    expect(next[0].value).toBe(3100)
    expect(next[6].value).toBe(3700)
  })

  it('carries a weekly rhythm forward and never projects below zero', () => {
    const weekly = Array.from({ length: 28 }, (_, i) => (i % 7 === 4 ? 7000 : 1000))
    const next = project(days(weekly))!
    const peak = next.reduce((best, d) => (d.value > best.value ? d : best))
    expect(new Date(`${peak.date}T12:00:00Z`).getUTCDay()).toBe(new Date('2026-09-05T12:00:00Z').getUTCDay())
    expect(project(days(Array.from({ length: 14 }, (_, i) => 1400 - i * 100)))!.every((d) => d.value >= 0)).toBe(true)
  })
})

describe('explaining a match', () => {
  it('says why in plain words', () => {
    expect(explainMatch({ score: 100, skill: 40, location: 25, budget: 15, availability: 10, reputation: 10, km: 0 }))
      .toBe('this is their trade · same area · within budget · taking bookings · well reviewed')
    expect(explainMatch({ score: 48, skill: 28, location: 12, budget: 8, availability: 0, reputation: 0, km: 9.4 }))
      .toBe('their trade is mentioned in the job · 9.4 km away · a little over budget')
    expect(explainMatch({ score: 0, skill: 0, location: 0, budget: 0, availability: 0, reputation: 0, km: null })).toBe('a weak fit')
  })

  it('says what the availability points rest on', () => {
    const base = { score: 50, skill: 40, location: 0, budget: 0, reputation: 0, km: null }
    expect(explainMatch({ ...base, availability: 10, taking_bookings: true, needed_on: '2026-10-22', free_days: 3, next_free: '2026-10-19' }))
      .toBe('this is their trade · free on 3 days before it is needed')
    expect(explainMatch({ ...base, availability: 6, taking_bookings: true, needed_on: '2026-10-22', free_days: 1, next_free: '2026-10-22' }))
      .toBe('this is their trade · free on Thu 22 Oct')
    expect(explainMatch({ ...base, availability: 0, taking_bookings: true, needed_on: '2026-10-22', free_days: 0, next_free: null }))
      .toBe('this is their trade · fully booked before then')
    expect(explainMatch({ ...base, availability: 4, taking_bookings: true, needed_on: null, free_days: 0, next_free: null }))
      .toBe('this is their trade · busy this week')
    expect(explainMatch({ ...base, availability: 0, taking_bookings: false, needed_on: null, free_days: 0, next_free: null }))
      .toBe('this is their trade · not taking bookings')
  })
})

describe('the seasonal forecast', () => {
  const days = (values: number[]) => values.map((value, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), value }))

  it('gives a range around each day, narrowest tomorrow', () => {
    const noisy = Array.from({ length: 42 }, (_, i) => 5000 + (i % 7 === 5 ? 3000 : 0) + ((i * 37) % 11) * 40)
    const f = forecast(days(noisy))!
    expect(f.days.every((d) => d.low <= d.value && d.value <= d.high)).toBe(true)
    expect(f.days[0].high - f.days[0].low).toBeLessThan(f.days[6].high - f.days[6].low)
  })

  it('checks itself on the last week, beside repeating the week before', () => {
    const rising = Array.from({ length: 28 }, (_, i) => 1000 + i * 50 + (i % 7 === 2 ? 800 : 0))
    const f = forecast(days(rising))!
    expect(f.backtest).not.toBeNull()
    // A steady rise is something the model can learn and a week-ago copy cannot.
    expect(f.backtest!.mae).toBeLessThan(f.backtest!.baseline_mae)
  })

  it('flags a day the model did not expect, and nothing in a steady series', () => {
    const steady = Array.from({ length: 35 }, (_, i) => 2000 + (i % 7 === 0 ? 500 : 0) + ((i * 13) % 5) * 10)
    expect(anomalies(days(steady))).toEqual([])
    const spiked = [...steady]
    spiked[30] = 9000
    const found = anomalies(days(spiked))
    expect(found.map((a) => [a.date, a.direction])).toEqual([[days(spiked)[30].date, 'high']])
  })

  it('is not dragged by one unusual day', () => {
    const steady = Array.from({ length: 35 }, (_, i) => 2000 + (i % 7 === 0 ? 500 : 0) + ((i * 13) % 5) * 10)
    const spiked = [...steady]
    spiked[33] = 12000
    const calm = forecast(days(steady))!.days
    const after = forecast(days(spiked))!.days
    after.forEach((d, k) => expect(Math.abs(d.value - calm[k].value)).toBeLessThan(0.1 * calm[k].value))
  })
})
