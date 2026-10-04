import { describe, expect, it } from 'vitest'
import { routePattern } from '../tracking'
import { project } from '../forecast'
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
})
