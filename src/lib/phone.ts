/**
 * Nigerian numbers are entered locally ("803 412 9087" or "0803 412 9087")
 * but Supabase auth requires E.164. Strips spaces and the trunk 0, then
 * prefixes the country code.
 */
export function toE164(local: string, countryCode = '234'): string {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '')
  return `+${countryCode}${digits}`
}

/** Renders an E.164 number back into the local format the UI shows. */
export function toLocal(e164: string, countryCode = '234'): string {
  return e164.replace(new RegExp(`^\\+${countryCode}`), '').trim()
}
