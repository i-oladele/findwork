import { lagosDate } from './format'

export type AnalyticsDay = { date: string; marketplace_fees: number; subscriptions: number; courses: number; catalog_collections: number; signups: number; bookings: number; orders: number }
export type AnalyticsReport = {
  as_of: string; from: string; to: string
  period: Omit<AnalyticsDay, 'date'> & { active_users: number; messages: number; ledger_entries: number; topups: number; customer_refunds: number; transfers: number }
  current: { users: number; wallet_balances: number; escrow_held: number; open_disputes: number; pending_withdrawals: number; gateway_refunds_due: number }
  daily: AnalyticsDay[]
}

export function reportDate(at = new Date()) {
  const d = lagosDate(at)
  return `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`
}

/** Date controls are Lagos calendar dates; the API's upper bound is exclusive. */
export function reportRange(from: string, through: string): { from: string; to: string } | null {
  const parse = (text: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return NaN
    const day = Date.parse(`${text}T00:00:00+01:00`)
    return Number.isFinite(day) && reportDate(new Date(day)) === text ? day : NaN
  }
  const start = parse(from), end = parse(through) + 86_400_000
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86_400_000) return null
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

export function analyticsCsv(report: AnalyticsReport): string {
  // Only fixed headers, validated dates and numeric aggregates go into CSV;
  // no user-provided names/text can become spreadsheet formulas.
  const columns: (keyof AnalyticsDay)[] = ['date','marketplace_fees','subscriptions','courses','catalog_collections','signups','bookings','orders']
  return [columns.join(','), ...report.daily.map((day) => columns.map((key) => {
    const value = day[key]
    if (key === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : ''
    return Number.isFinite(Number(value)) ? String(Number(value)) : ''
  }).join(','))].join('\r\n')
}
