import { lagosDate, lagosToIso } from './format'
import type { Tables } from './database.types'

/** How many days ahead the picker offers. pay_booking refuses beyond 90. */
export const DAYS_AHEAD = 14

/** Bookable times, Lagos wall clock. */
export const TIMES = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00']

/** An hour's notice, so nobody is booked for five minutes' time. */
export const NOTICE_MS = 60 * 60 * 1000

export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

export type Availability = Tables<'provider_availability'> | null | undefined
export type BusySlot = { start_at: string; end_at: string }
export type LagosDay = { year: number; month: number; day: number; weekday: number }

/** Used while availability loads, and for providers who have no row. */
const DEFAULT_OPEN = { sunday: false, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true }

export function isOpenOn(availability: Availability, weekday: number): boolean {
  const key = WEEKDAY_KEYS[weekday]
  return availability ? availability[key] : DEFAULT_OPEN[key]
}

/** The next DAYS_AHEAD days in Lagos, today first. */
export function upcomingDays(now = Date.now()): LagosDay[] {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => lagosDate(new Date(now + i * 86_400_000)))
}

export function sameDay(a: LagosDay, b: LagosDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/**
 * Whether a slot can be booked. The server checks all of this again in
 * private.create_booking; this only saves the customer a wasted tap.
 */
export function slotState(input: {
  day: LagosDay
  time: string
  durationMinutes: number
  busy: BusySlot[]
  now?: number
}): 'ok' | 'past' | 'taken' {
  const now = input.now ?? Date.now()
  const start = new Date(lagosToIso(input.day, input.time)).getTime()
  if (start < now + NOTICE_MS) return 'past'

  const end = start + input.durationMinutes * 60_000
  const clash = input.busy.some(
    (b) => start < new Date(b.end_at).getTime() && end > new Date(b.start_at).getTime(),
  )
  return clash ? 'taken' : 'ok'
}
