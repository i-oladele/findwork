import { describe, expect, it } from 'vitest'
import { toE164, toLocal } from '../phone'

describe('toE164', () => {
  it('prefixes the country code', () => {
    expect(toE164('8034129087')).toBe('+2348034129087')
  })

  it('strips the spaces people actually type', () => {
    expect(toE164('803 412 9087')).toBe('+2348034129087')
  })

  it('drops the trunk zero, which is how Nigerian numbers are written locally', () => {
    expect(toE164('0803 412 9087')).toBe('+2348034129087')
  })

  it('ignores punctuation', () => {
    expect(toE164('(0803) 412-9087')).toBe('+2348034129087')
  })

  it('round-trips through toLocal', () => {
    expect(toLocal(toE164('08034129087'))).toBe('8034129087')
  })
})
