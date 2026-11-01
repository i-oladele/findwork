import { describe, expect, it } from 'vitest'
import { fromLagosInput, minutesSince, onCallAt, shiftForGap, toLagosInput, upcomingGaps } from '../rota'

const at = (iso: string) => new Date(iso).getTime()

describe('Lagos time inputs', () => {
  it('shows an instant as Lagos wall-clock time', () => {
    expect(toLagosInput(new Date('2026-11-01T19:00:00Z'))).toBe('2026-11-01T20:00')
  })

  it('reads an input as Lagos time, not the device zone', () => {
    expect(fromLagosInput('2026-11-01T20:00')?.toISOString()).toBe('2026-11-01T19:00:00.000Z')
  })

  it('round-trips across midnight', () => {
    const value = '2026-12-31T23:30'
    expect(toLagosInput(fromLagosInput(value)!)).toBe(value)
  })

  it('rejects anything that is not a full date and time', () => {
    expect(fromLagosInput('')).toBeNull()
    expect(fromLagosInput('2026-11-01')).toBeNull()
    expect(fromLagosInput('2026-13-45T25:00')).toBeNull()
  })
})

describe('who is on call', () => {
  const shifts = [
    { duty: 'primary' as const, starts_at: '2026-11-01T07:00:00Z', ends_at: '2026-11-01T19:00:00Z', staff: { full_name: 'Ngozi' } },
    { duty: 'backup' as const, starts_at: '2026-11-01T07:00:00Z', ends_at: '2026-11-02T07:00:00Z', staff: { full_name: 'Bayo' } },
  ]

  it('names the primary and backup covering the moment', () => {
    expect(onCallAt(shifts, [], at('2026-11-01T12:00:00Z'))).toEqual({ primary: 'Ngozi', backup: 'Bayo', uncovered: false })
  })

  it('a shift ends at its end time', () => {
    const gaps = [{ starts_at: '2026-11-01T19:00:00Z', ends_at: '2026-11-02T07:00:00Z' }]
    expect(onCallAt(shifts, gaps, at('2026-11-01T19:00:00Z'))).toEqual({ primary: null, backup: 'Bayo', uncovered: true })
  })

  it('trusts the server gap over a shift whose holder lost their role', () => {
    const gaps = [{ starts_at: '2026-11-01T07:00:00Z', ends_at: '2026-11-01T19:00:00Z' }]
    expect(onCallAt(shifts, gaps, at('2026-11-01T12:00:00Z')).primary).toBeNull()
  })
})

describe('gaps still to come', () => {
  const now = at('2026-11-01T12:00:00Z')
  it('drops gaps that are over and starts the current one now', () => {
    expect(upcomingGaps([
      { starts_at: '2026-11-01T08:00:00Z', ends_at: '2026-11-01T09:00:00Z' },
      { starts_at: '2026-11-01T11:00:00Z', ends_at: '2026-11-01T13:00:00Z' },
      { starts_at: '2026-11-02T00:00:00Z', ends_at: '2026-11-02T06:00:00Z' },
    ], now)).toEqual([
      { starts_at: '2026-11-01T12:00:00.000Z', ends_at: '2026-11-01T13:00:00Z' },
      { starts_at: '2026-11-02T00:00:00Z', ends_at: '2026-11-02T06:00:00Z' },
    ])
  })

  it('a gap is filled by a shift of the same span, at most a week', () => {
    const short = shiftForGap({ starts_at: '2026-11-01T19:00:00Z', ends_at: '2026-11-02T07:00:00Z' })
    expect(short.endsAt.toISOString()).toBe('2026-11-02T07:00:00.000Z')
    const long = shiftForGap({ starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-20T00:00:00Z' })
    expect(long.endsAt.toISOString()).toBe('2026-11-08T00:00:00.000Z')
  })
})

describe('minutes since', () => {
  it('counts whole minutes and never goes negative', () => {
    expect(minutesSince('2026-11-01T12:00:00Z', at('2026-11-01T12:04:59Z'))).toBe(4)
    expect(minutesSince('2026-11-01T12:00:00Z', at('2026-11-01T11:59:00Z'))).toBe(0)
  })
})
