import { describe, expect, it } from 'vitest'
import { isOpenOn, slotState, upcomingDays, type Availability, type BusySlot } from '../slots'

const MONDAY_NOON_UTC = new Date('2026-03-09T12:00:00Z').getTime()
const monday = { year: 2026, month: 3, day: 9, weekday: 1 }

const closedSundays: Availability = {
  provider_id: 'p',
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: false,
}

describe('isOpenOn', () => {
  it('follows the provider row', () => {
    expect(isOpenOn(closedSundays, 0)).toBe(false)
    expect(isOpenOn(closedSundays, 1)).toBe(true)
  })

  it('falls back to Monday–Saturday when a provider has no row yet', () => {
    expect(isOpenOn(null, 0)).toBe(false)
    expect(isOpenOn(undefined, 6)).toBe(true)
  })
})

describe('slotState', () => {
  const base = { day: monday, durationMinutes: 60, busy: [] as BusySlot[], now: MONDAY_NOON_UTC }

  it('refuses times that have passed', () => {
    // 09:00 Lagos is 08:00 UTC — four hours before "now".
    expect(slotState({ ...base, time: '09:00' })).toBe('past')
  })

  it('refuses a time less than an hour away', () => {
    // 13:30 Lagos is 12:30 UTC, half an hour after "now".
    expect(slotState({ ...base, time: '13:30' })).toBe('past')
  })

  it('allows a time with enough notice', () => {
    expect(slotState({ ...base, time: '15:00' })).toBe('ok')
  })

  it('marks a slot taken when it overlaps an existing booking', () => {
    const busy = [{ start_at: '2026-03-09T14:30:00Z', end_at: '2026-03-09T15:30:00Z' }]
    // 16:30 Lagos = 15:30 UTC: starts exactly as the other ends, so free.
    expect(slotState({ ...base, time: '16:30', busy })).toBe('ok')
    // 15:00 Lagos = 14:00 UTC, running to 15:00 UTC: overlaps by 30 minutes.
    expect(slotState({ ...base, time: '15:00', busy })).toBe('taken')
  })

  it('takes the service length into account, not just the start', () => {
    const busy = [{ start_at: '2026-03-09T17:00:00Z', end_at: '2026-03-09T18:00:00Z' }]
    // 16:30 Lagos = 15:30 UTC. An hour ends at 16:30 UTC, clear of it;
    // four hours runs to 19:30 UTC, straight through it.
    expect(slotState({ ...base, time: '16:30', busy })).toBe('ok')
    expect(slotState({ ...base, time: '16:30', busy, durationMinutes: 240 })).toBe('taken')
  })
})

describe('upcomingDays', () => {
  it('starts today and runs two weeks', () => {
    const days = upcomingDays(MONDAY_NOON_UTC)
    expect(days).toHaveLength(14)
    expect(days[0]).toEqual(monday)
    expect(days[13].day).toBe(22)
  })
})
