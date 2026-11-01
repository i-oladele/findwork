import type { SosDuty } from './database.types'

/** Lagos is UTC+1 all year; it has no daylight saving. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000

/** A date as a datetime-local value ("2026-11-01T20:00") in Lagos time. */
export function toLagosInput(date: Date): string {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 16)
}

/** A datetime-local value read as Lagos time, whatever the device's own zone. */
export function fromLagosInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+01:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

type Shift = { duty: SosDuty; starts_at: string; ends_at: string; staff: { full_name: string } | null }
type Gap = { starts_at: string; ends_at: string }

const covers = (s: { starts_at: string; ends_at: string }, at: number) =>
  new Date(s.starts_at).getTime() <= at && new Date(s.ends_at).getTime() > at

/**
 * Who is on call at a moment. The gaps come from the server, which leaves
 * out shifts held by someone who has since lost their staff role, so a
 * moment inside a gap has no primary even if a shift says otherwise.
 */
export function onCallAt(shifts: Shift[], gaps: Gap[], at = Date.now()) {
  const name = (duty: SosDuty) => shifts.find((s) => s.duty === duty && covers(s, at))?.staff?.full_name ?? null
  const uncovered = gaps.some((g) => covers(g, at))
  return { primary: uncovered ? null : name('primary'), backup: name('backup'), uncovered }
}

/** Gaps still to come, the current one cut to start now. */
export function upcomingGaps(gaps: Gap[], now = Date.now()): Gap[] {
  return gaps
    .filter((g) => new Date(g.ends_at).getTime() > now)
    .map((g) => (new Date(g.starts_at).getTime() < now ? { ...g, starts_at: new Date(now).toISOString() } : g))
}

/** Whole minutes since a moment, never negative. */
export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
}

/** The longest shift the server accepts. */
export const MAX_SHIFT_MS = 7 * 24 * 60 * 60 * 1000

/** A new shift to fill a gap: the gap itself, up to a week long. */
export function shiftForGap(gap: Gap): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(gap.starts_at)
  const endsAt = new Date(Math.min(new Date(gap.ends_at).getTime(), startsAt.getTime() + MAX_SHIFT_MS))
  return { startsAt, endsAt }
}
