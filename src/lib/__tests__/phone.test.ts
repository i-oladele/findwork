import { describe, expect, it } from 'vitest'
import {
  COMMON_COUNTRIES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  emptyPhone,
  examplePhone,
  formatPhone,
  fromInternational,
  isPhoneNumber,
  phoneProblem,
  toE164,
} from '../phone'

const ng = (number: string) => ({ country: 'NG' as const, number })

describe('the country list', () => {
  it('covers the world, not just Nigeria', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200)
    expect(COUNTRIES.find((c) => c.code === 'GB')).toMatchObject({ name: 'United Kingdom', dial: '+44' })
    expect(COUNTRIES.find((c) => c.code === 'US')?.dial).toBe('+1')
  })

  it('starts on Nigeria', () => {
    expect(DEFAULT_COUNTRY).toBe('NG')
    expect(emptyPhone()).toEqual({ country: 'NG', number: '' })
    expect(COMMON_COUNTRIES[0]).toBe('NG')
    expect(COUNTRIES.find((c) => c.code === 'NG')).toMatchObject({ name: 'Nigeria', dial: '+234', flag: '🇳🇬' })
  })

  it('is alphabetical, so a country is where people look for it', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('shows a real local number as the placeholder', () => {
    expect(examplePhone('NG')).toMatch(/^0\d{3} \d{3} \d{4}$/)
  })
})

describe('toE164', () => {
  it('handles Nigerian numbers however they are written', () => {
    for (const n of ['8034129087', '803 412 9087', '0803 412 9087', '(0803) 412-9087', '+234 803 412 9087']) {
      expect(toE164(ng(n))).toBe('+2348034129087')
    }
  })

  it('uses the country picked, with that country’s rules for the leading 0', () => {
    expect(toE164({ country: 'GB', number: '07400 123456' })).toBe('+447400123456')
    expect(toE164({ country: 'GH', number: '024 123 4567' })).toBe('+233241234567')
    expect(toE164({ country: 'US', number: '(201) 555-0123' })).toBe('+12015550123')
    // Italian numbers keep their 0 after the country code.
    expect(toE164({ country: 'IT', number: '06 1234 5678' })).toBe('+390612345678')
  })
})

describe('isPhoneNumber and phoneProblem', () => {
  it('accepts numbers from any country', () => {
    expect(isPhoneNumber(ng('0803 412 9087'))).toBe(true)
    expect(isPhoneNumber({ country: 'GB', number: '07400 123456' })).toBe(true)
    expect(isPhoneNumber({ country: 'KE', number: '0712 123456' })).toBe(true)
    expect(isPhoneNumber({ country: 'US', number: '201 555 0123' })).toBe(true)
  })

  it('names what is wrong with a number that cannot be right', () => {
    expect(phoneProblem(ng('0803 41'))).toBe('too_short')
    expect(phoneProblem({ country: 'GB', number: '07400 123456 7890' })).toBe('too_long')
    expect(phoneProblem(ng(''))).toBeNull()
    expect(phoneProblem(ng('0803 412 9087'))).toBeNull()
    expect(isPhoneNumber(ng(''))).toBe(false)
  })
})

describe('fromInternational', () => {
  it('moves a pasted or autofilled +code number to its own country', () => {
    expect(fromInternational('+44 7400 123456')).toEqual({ country: 'GB', number: '07400 123456' })
    expect(fromInternational('+234 803 412 9087')).toEqual({ country: 'NG', number: '0803 412 9087' })
  })

  it('leaves local numbers, and half-typed ones, alone', () => {
    expect(fromInternational('0803 412 9087')).toBeNull()
    expect(fromInternational('+44 74')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('reads a stored number back in international form', () => {
    expect(formatPhone('+2348034129087')).toBe('+234 803 412 9087')
    expect(formatPhone('+447400123456')).toBe('+44 7400 123456')
  })

  it('leaves anything it cannot read as it was', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('not a number')).toBe('not a number')
  })
})
