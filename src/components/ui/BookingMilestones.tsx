import { useState } from 'react'
import { Alert } from './Alert'
import { useBookingMilestones, useReleaseMilestone } from '../../lib/api/bookings'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'

const STATUS = { pending: 'Held', released: 'Paid', refunded: 'Refunded' } as const

/**
 * The stages of a job paid in stages. The customer releases them in order;
 * the provider sees which have been paid. Renders nothing for an ordinary
 * booking.
 */
export function BookingMilestones({ bookingId, canRelease }: { bookingId: string; canRelease: boolean }) {
  const { data } = useBookingMilestones(bookingId)
  const release = useReleaseMilestone()
  const [error, setError] = useState<string | null>(null)
  if (!data?.length) return null
  const next = data.find((m) => m.status === 'pending')

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Paid in stages</div>
      <ol className="space-y-2">
        {data.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 text-[14px]">
            <i className={`${m.status === 'released' ? 'ph-fill ph-check-circle text-success' : m.status === 'refunded' ? 'ph ph-arrow-counter-clockwise text-muted-2' : 'ph ph-circle text-muted-3'} text-[18px]`} />
            <span className="flex-1 min-w-0 truncate text-ink">{m.title}</span>
            <span className="text-muted">{formatNaira(m.amount)} · {STATUS[m.status]}</span>
          </li>
        ))}
      </ol>
      {canRelease && next && (
        <button
          disabled={release.isPending}
          className="mt-3 w-full h-11 border-[1.5px] border-success text-success-text rounded-lg text-[14.5px] font-semibold disabled:opacity-50"
          onClick={() => {
            if (!window.confirm(`Release ${formatNaira(next.amount)} for "${next.title}"? Only do this once that part is done.`)) return
            setError(null)
            release.mutate(next.id, { onError: (e) => setError(friendlyError(e)) })
          }}
        >
          Release stage: {next.title}
        </button>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  )
}
