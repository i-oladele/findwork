import { useMemo, useState } from 'react'
import { useBusySlots, useProviderAvailability } from '../../lib/api'
import { lagosToIso } from '../../lib/format'
import { DAYS_AHEAD, TIMES, isOpenOn, sameDay, slotState, upcomingDays } from '../../lib/slots'
import { SectionLabel } from './SectionLabel'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Pick a day and time for a booking, in Lagos time. Days the provider is
 * closed are hidden, and slots that are past or already taken are disabled.
 */
export function SlotPicker({
  providerId,
  durationMinutes = 60,
  value,
  onChange,
  bookingId,
}: {
  providerId: string
  durationMinutes?: number
  value: string | null
  onChange: (iso: string | null) => void
  bookingId?: string
}) {
  const days = useMemo(() => upcomingDays(), [])
  const [from, to] = useMemo(
    () => [new Date().toISOString(), new Date(Date.now() + (DAYS_AHEAD + 1) * 86_400_000).toISOString()],
    [],
  )
  const availabilityQuery = useProviderAvailability(providerId)
  const busyQuery = useBusySlots(providerId, from, to, bookingId)
  const { data: availability } = availabilityQuery
  const { data: busy = [] } = busyQuery

  const openDays = days.filter((d) => isOpenOn(availability, d.weekday))
  const [selectedDay, setSelectedDay] = useState<(typeof days)[number] | null>(null)
  const day = selectedDay ?? openDays[0] ?? null

  if (availabilityQuery.isError || busyQuery.isError) {
    return <div role="alert" className="text-[14px] text-muted">
      We could not check available times.
      <button type="button" className="ml-2 font-semibold text-brand-hover" onClick={() => {
        onChange(null)
        void availabilityQuery.refetch()
        void busyQuery.refetch()
      }}>Try again</button>
    </div>
  }
  if (availabilityQuery.isLoading || busyQuery.isLoading) {
    return <p role="status" className="text-[14px] text-muted">Checking available times…</p>
  }

  if (openDays.length === 0) {
    return <p className="text-[14px] text-muted">This provider has not opened any days for booking.</p>
  }

  return (
    <div>
      <SectionLabel className="mb-2.5">Day</SectionLabel>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-[22px] px-[22px]">
        {openDays.map((d) => {
          const active = day !== null && sameDay(d, day)
          return (
            <button
              key={`${d.month}-${d.day}`}
              type="button"
              onClick={() => {
                setSelectedDay(d)
                onChange(null)
              }}
              className={`flex-none w-[58px] py-2.5 rounded-xl text-center ${
                active ? 'bg-brand text-white' : 'bg-white border border-line text-ink'
              }`}
            >
              <div className={`font-mono text-[10.5px] uppercase ${active ? 'text-white/80' : 'text-muted-2'}`}>
                {WEEKDAY_SHORT[d.weekday]}
              </div>
              <div className="font-display font-bold text-[18px] mt-0.5">{d.day}</div>
              <div className={`text-[11px] ${active ? 'text-white/80' : 'text-muted-2'}`}>{MONTH_SHORT[d.month - 1]}</div>
            </button>
          )
        })}
      </div>

      <SectionLabel className="mt-5 mb-2.5">Time (Lagos)</SectionLabel>
      <div className="grid grid-cols-3 gap-2.5">
        {TIMES.map((t) => {
          const state = day ? slotState({ day, time: t, durationMinutes, busy }) : 'past'
          const iso = day ? lagosToIso(day, t) : null
          const active = iso !== null && iso === value
          return (
            <button
              key={t}
              type="button"
              disabled={state !== 'ok'}
              title={state === 'taken' ? 'Already booked' : undefined}
              onClick={() => onChange(iso)}
              className={`h-12 flex items-center justify-center rounded-lg text-[15px] ${
                state !== 'ok'
                  ? 'bg-line-soft text-muted-4 line-through'
                  : active
                    ? 'bg-ink text-white font-semibold'
                    : 'bg-white border border-line text-ink font-medium'
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
