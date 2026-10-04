import { describe, expect, it } from 'vitest'
import { analyticsCsv, reportDate, reportRange, type AnalyticsReport } from '../analytics'

describe('Lagos report dates', () => {
  it('includes the full end date and handles midnight across month boundaries', () => {
    expect(reportRange('2026-09-30', '2026-10-01')).toEqual({ from: '2026-09-29T23:00:00.000Z', to: '2026-10-01T23:00:00.000Z' })
    expect(reportDate(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01')
  })
  it('rejects invalid dates, reversed ranges and oversized reports', () => {
    expect(reportRange('2026-02-30','2026-03-02')).toBeNull()
    expect(reportRange('2026-10-04','2026-10-03')).toBeNull()
    expect(reportRange('2025-01-01','2026-10-04')).toBeNull()
    expect(reportRange('','2026-10-04')).toBeNull()
  })
  it('keeps negative revenue adjustments and prevents spreadsheet formulas', () => {
    const report = { daily: [{ date: '2026-10-04', marketplace_fees: -600, subscriptions: 0, courses: 0, catalog_collections: -10000, signups: 1, bookings: 2, orders: 3 }] } as AnalyticsReport
    expect(analyticsCsv(report)).toContain('2026-10-04,-600,0,0,-10000,1,2,3')
    report.daily[0].date = '=HYPERLINK("bad")'
    expect(analyticsCsv(report)).not.toContain('HYPERLINK')
  })
})
