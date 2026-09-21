import { describe, expect, it } from 'vitest'
import { agoPhrase, formatDateTime, formatNaira, lagosDate, lagosToIso, parseNaira, shortId } from '../format'

describe('formatNaira', () => {
  it('groups thousands and marks negatives', () => {
    expect(formatNaira(12000)).toBe('₦12,000')
    expect(formatNaira(-12600)).toBe('−₦12,600')
    expect(formatNaira(0)).toBe('₦0')
  })
})

describe('parseNaira', () => {
  it('reads what people actually type', () => {
    expect(parseNaira('60,000')).toBe(60000)
    expect(parseNaira('₦ 60 000')).toBe(60000)
    expect(parseNaira('')).toBe(0)
    expect(parseNaira('abc')).toBe(0)
  })
})

describe('Lagos time', () => {
  it('converts a Lagos wall clock to the right instant (UTC+1, no daylight saving)', () => {
    expect(lagosToIso({ year: 2026, month: 3, day: 12 }, '11:30')).toBe('2026-03-12T10:30:00.000Z')
    // July, when a DST-observing zone would have shifted.
    expect(lagosToIso({ year: 2026, month: 7, day: 1 }, '09:00')).toBe('2026-07-01T08:00:00.000Z')
  })

  it('reads the Lagos calendar day back, including across midnight UTC', () => {
    // 23:30 UTC on the 11th is 00:30 on the 12th in Lagos.
    expect(lagosDate(new Date('2026-03-11T23:30:00Z'))).toEqual({ year: 2026, month: 3, day: 12, weekday: 4 })
  })

  it('shows times in Lagos regardless of the device timezone', () => {
    expect(formatDateTime('2026-03-12T10:30:00.000Z')).toBe('Thu 12 Mar, 11:30')
  })
})

describe('agoPhrase', () => {
  const now = new Date('2026-03-12T12:00:00Z').getTime()
  it('reads as a phrase, never "now ago"', () => {
    expect(agoPhrase('2026-03-12T11:59:30Z', now)).toBe('just now')
    expect(agoPhrase('2026-03-12T11:30:00Z', now)).toBe('30m ago')
    expect(agoPhrase('2026-03-10T12:00:00Z', now)).toBe('2d ago')
    expect(agoPhrase('2026-02-10T12:00:00Z', now)).toBe('on 10 Feb')
  })
})

describe('shortId', () => {
  it('shortens a uuid into something a person can read out', () => {
    expect(shortId('3f2a91c0-1b2c-4d5e-8f90-abcdef123456')).toBe('#3F2A91C0')
  })
})
