import { describe, expect, it, vi } from 'vitest'
import {
  checkBusiness,
  checkPerson,
  companyNamesMatch,
  companyType,
  localPhone,
  namesMatch,
  normalizeName,
  type DojahApi,
} from '../../../supabase/functions/identity-check/identityCheck.ts'

/**
 * A match here verifies an account with nobody looking, so the rules are
 * strict and anything uncertain is left for staff.
 */
describe('comparing names with the register', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalizeName("  Adébáyọ̀  O'Neil-Okafor ")).toBe('ADEBAYO ONEIL OKAFOR')
  })

  it('matches first and last names in either order', () => {
    expect(namesMatch(['ADA', 'CHIOMA', 'OKAFOR'], { first_name: 'Ada', last_name: 'Okafor' })).toBe('match')
    expect(namesMatch(['OKAFOR', 'ADA'], { first_name: 'ada', last_name: 'okafor' })).toBe('match')
    expect(namesMatch(['Chioma', 'Okafor'], { full_name: 'Chioma Blessing Okafor' })).toBe('match')
  })

  it('refuses a different person, or too little to go on', () => {
    expect(namesMatch(['ADA', 'OKAFOR'], { first_name: 'Ada', last_name: 'Bello' })).toBe('mismatch')
    expect(namesMatch(['ADA', 'OKAFOR'], { full_name: 'Ada' })).toBe('unknown')
    expect(namesMatch([], { first_name: 'Ada', last_name: 'Okafor' })).toBe('unknown')
  })
})

describe('businesses and phone numbers', () => {
  it('reads the company type from the registration number', () => {
    expect(companyType('RC1261103')).toBe('COMPANY')
    expect(companyType('1261103')).toBe('COMPANY')
    expect(companyType('BN123456')).toBe('BUSINESS_NAME')
    expect(companyType('IT9876')).toBe('INCORPORATED_TRUSTEES')
    expect(companyType('LLP4321')).toBe('LIMITED_LIABILITY_PARTNERSHIP')
  })

  it('sets the usual suffixes aside, but nothing more', () => {
    expect(companyNamesMatch('KEMI FOODS LIMITED', 'Kemi Foods Ltd')).toBe(true)
    expect(companyNamesMatch('ADA & SONS NIGERIA LTD', 'Ada and Sons')).toBe(true)
    expect(companyNamesMatch('KEMI FOODS LIMITED', 'Kemi Drinks Ltd')).toBe(false)
  })

  it('turns an E.164 Nigerian number into the local form the register uses', () => {
    expect(localPhone('+2348031234567')).toBe('08031234567')
    expect(localPhone('08031234567')).toBe('08031234567')
    expect(localPhone('+447700900123')).toBeNull()
    expect(localPhone(null)).toBeNull()
  })
})

function api(overrides: Partial<DojahApi>): DojahApi {
  const none = () => Promise.resolve({ found: false as const, message: 'not used' })
  return { ninLookup: none, ninSelfie: none, bvnSelfie: none, phoneLookup: none, cacLookup: none, ...overrides }
}

const person = { id_type: 'nin', id_number: '70123456789', first_name: 'Bisi', last_name: 'Adeyemi', full_name: 'Bisi Adeyemi', phone: '+2349011111111' }

describe('checking an ID', () => {
  it('records the number, the face and the phone when all agree', async () => {
    const results = await checkPerson(person, api({
      ninLookup: async () => ({ found: true, entity: { first_name: 'BISI', last_name: 'ADEYEMI' } }),
      ninSelfie: async () => ({ found: true, entity: { selfie_verification: { confidence_value: 97.456, match: true } } }),
      phoneLookup: async () => ({ found: true, entity: { first_name: 'BISI', middle_name: 'T', last_name: 'ADEYEMI' } }),
    }), async () => 'base64-selfie')
    expect(results.map((r) => [r.kind, r.outcome])).toEqual([['nin', 'match'], ['face', 'match'], ['sim', 'match']])
    expect(results[1].confidence).toBe(97.46)
    expect(results[0].detail).toEqual({ registry_name: 'BISI ADEYEMI' })
  })

  it('does not compare a face with a number the register does not hold', async () => {
    const selfie = vi.fn()
    const results = await checkPerson(person, api({ ninLookup: async () => ({ found: false, message: 'NIN not found' }), ninSelfie: selfie }), async () => 'x')
    expect(results).toEqual([{ kind: 'nin', outcome: 'not_found', confidence: null, detail: { message: 'NIN not found' } }])
    expect(selfie).not.toHaveBeenCalled()
  })

  it("reads a BVN and its face comparison from one answer, and flags a phone in someone else's name", async () => {
    const results = await checkPerson({ ...person, id_type: 'bvn', id_number: '22222222222' }, api({
      bvnSelfie: async () => ({ found: true, entity: { first_name: 'BISI', last_name: 'ADEYEMI', selfie_verification: { confidence_value: 40, match: false } } }),
      phoneLookup: async () => ({ found: true, entity: { first_name: 'TUNDE', last_name: 'BAKARE' } }),
    }), async () => 'x')
    expect(results.map((r) => [r.kind, r.outcome])).toEqual([['bvn', 'match'], ['face', 'mismatch'], ['sim', 'mismatch']])
  })

  it('records an error, never a mismatch, when the service fails', async () => {
    const results = await checkPerson(person, api({ ninLookup: async () => { throw new Error('Dojah down') } }), async () => 'x')
    expect(results).toEqual([{ kind: 'nin', outcome: 'error', confidence: null, detail: { message: 'Dojah down' } }])
  })

  it('leaves IDs the register cannot check to staff', async () => {
    expect(await checkPerson({ ...person, id_type: 'passport' }, api({}), async () => 'x')).toEqual([])
  })
})

describe('checking a business', () => {
  it('matches a registered, active company under its own name', async () => {
    const cac = vi.fn(async () => ({ found: true as const, entity: { company_name: 'KEMI FOODS LIMITED', status: 'ACTIVE' } }))
    expect(await checkBusiness({ rc_number: 'RC1261103', business_name: 'Kemi Foods Ltd' }, api({ cacLookup: cac })))
      .toEqual([{ kind: 'cac', outcome: 'match', confidence: null, detail: { registry_name: 'KEMI FOODS LIMITED', status: 'ACTIVE' } }])
    expect(cac).toHaveBeenCalledWith('1261103', 'COMPANY')
  })

  it('refuses an inactive company, even under the right name', async () => {
    const results = await checkBusiness({ rc_number: 'RC1261103', business_name: 'Kemi Foods Ltd' },
      api({ cacLookup: async () => ({ found: true, entity: { company_name: 'KEMI FOODS LIMITED', status: 'INACTIVE' } }) }))
    expect(results[0].outcome).toBe('mismatch')
  })
})
