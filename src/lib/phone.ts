import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js'
import mobileExamples from 'libphonenumber-js/mobile/examples'

/**
 * Phone numbers from anywhere, entered the way people write them at home
 * ("0803 412 9087" in Nigeria, "07400 123456" in the UK) after picking a
 * country. Supabase auth needs E.164 ("+2348034129087"). libphonenumber-js
 * knows each country's calling code, number lengths and trunk prefix (the
 * leading 0 that Nigeria and the UK drop but Italy keeps).
 */
export type { CountryCode }

/** Most people using the app are in Nigeria. */
export const DEFAULT_COUNTRY: CountryCode = 'NG'

/** A number as typed: the country picked, and the number in local form. */
export type PhoneValue = { country: CountryCode; number: string }

export function emptyPhone(): PhoneValue {
  return { country: DEFAULT_COUNTRY, number: '' }
}

export type Country = { code: CountryCode; name: string; dial: string; flag: string }

/** Every country with a calling code, named in English, A to Z. */
export const COUNTRIES: Country[] = (() => {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    // Very old browsers: fall back to the ISO code.
  }
  return getCountries()
    .map((code) => ({
      code,
      name: names?.of(code) ?? code,
      dial: `+${getCountryCallingCode(code)}`,
      flag: flagOf(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})()

/** Listed first in the picker: where the app's people mostly are, and the diaspora. */
export const COMMON_COUNTRIES: CountryCode[] = ['NG', 'GH', 'KE', 'ZA', 'GB', 'US', 'CA']

export function countryOf(code: CountryCode): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY)!
}

/** "0803 412 9087": a real-looking local number for the placeholder. */
export function examplePhone(country: CountryCode): string {
  return getExampleNumber(country, mobileExamples)?.formatNational() ?? 'Phone number'
}

/** The number in E.164, as Supabase auth stores it. */
export function toE164({ country, number }: PhoneValue): string {
  const parsed = parsePhoneNumberFromString(number, country)
  if (parsed) return parsed.number
  const digits = number.replace(/\D/g, '')
  return `+${getCountryCallingCode(country)}${digits}`
}

/**
 * Whether the number has the right length for its country. The library's
 * compact metadata checks length, not which digits a number starts with, so
 * a real number on a new range is never turned away.
 */
export function isPhoneNumber({ country, number }: PhoneValue): boolean {
  return number.trim() !== '' && isValidPhoneNumber(number, country)
}

/** Why a finished-looking number cannot be right, in the terms the form shows. */
export function phoneProblem({ country, number }: PhoneValue): 'too_short' | 'too_long' | 'invalid' | null {
  if (number.trim() === '' || isValidPhoneNumber(number, country)) return null
  const length = validatePhoneNumberLength(number, country)
  if (length === 'TOO_SHORT') return 'too_short'
  if (length === 'TOO_LONG') return 'too_long'
  return 'invalid'
}

/**
 * A number typed, pasted or autofilled with its own "+code": which country it
 * belongs to, and the local form to show. Null until it is a whole number.
 */
export function fromInternational(input: string): PhoneValue | null {
  if (!input.trim().startsWith('+')) return null
  const parsed = parsePhoneNumberFromString(input)
  if (!parsed?.country || !parsed.isPossible()) return null
  return { country: parsed.country, number: parsed.formatNational() }
}

/** "+234 803 412 9087": how a stored number is read back to its owner. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
}

function flagOf(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
