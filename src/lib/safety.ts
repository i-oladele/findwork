import type { MeetupStatus } from './database.types'

export const MEETUP_STATUS: Record<MeetupStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  proposed: { label: 'Waiting for the seller', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Done', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/** Nigeria's national emergency number, and Lagos State's own line. */
export const EMERGENCY_NUMBERS = [
  { label: 'Emergency (112)', tel: '112' },
  { label: 'Lagos emergency (767)', tel: '767' },
] as const

/** A link that opens the given point in a maps app. */
export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/**
 * A text message to a trusted contact, opened in the phone's own messaging
 * app so it needs no SMS provider and comes from a number they recognise.
 */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`
}

export function safetyMessage(input: { name: string; place?: string | null; lat?: number | null; lng?: number | null; urgent: boolean }): string {
  const where = input.lat != null && input.lng != null ? ` I am here: ${mapLink(input.lat, input.lng)}` : ''
  const meeting = input.place ? ` I am meeting someone from FindWork at ${input.place}.` : ''
  return input.urgent
    ? `This is ${input.name}. I need help now.${meeting}${where} Please call me.`
    : `This is ${input.name}.${meeting}${where} I will message you when I am done.`
}
