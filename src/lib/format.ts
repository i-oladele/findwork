/**
 * Display formatting shared by every screen. Dates are always shown in Lagos
 * time, whatever timezone the phone is set to: a booking at 10:00 means
 * 10:00 where the job happens.
 */
export const TIMEZONE = 'Africa/Lagos'

export function formatNaira(amount: number): string {
  const sign = amount < 0 ? '−' : ''
  return `${sign}₦${Math.abs(amount).toLocaleString('en-NG')}`
}

/** Parses what people type into a money field: "60,000", "₦ 60000", " 60 000 ". */
export function parseNaira(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

/** "Thu 12 Mar, 11:30" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIMEZONE })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE })
  return `${date.replace(',', '')}, ${time}`
}

/** "12 Mar 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  })
}

/** "11:30" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  })
}

/** "now", "5m", "3h", "2d", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.floor((now - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TIMEZONE })
}

/** "just now", "5m ago", "2d ago", "on 12 Mar" — for use in a sentence. */
export function agoPhrase(iso: string, now = Date.now()): string {
  const short = timeAgo(iso, now)
  if (short === 'now') return 'just now'
  if (/^\d+[mhd]$/.test(short)) return `${short} ago`
  return `on ${short}`
}

/** Short, human-readable form of a uuid for receipts: "#3F2A91C0". */
export function shortId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'there'
}

/**
 * Builds a UTC instant from a Lagos calendar date and wall-clock time.
 * Lagos is UTC+1 all year (no daylight saving), so this needs no library.
 */
export function lagosToIso(date: { year: number; month: number; day: number }, time: string): string {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(date.year, date.month - 1, date.day, h - 1, m)).toISOString()
}

/** The Lagos calendar date for an instant: { year, month (1-12), day, weekday (0=Sun) }. */
export function lagosDate(at: Date = new Date()) {
  const shifted = new Date(at.getTime() + 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}
