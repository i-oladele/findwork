import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SlotPicker } from '../../components/ui/SlotPicker'
import { EmptyState, ErrorState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  useBooking, useBookingReschedules, useDisputes, useRequestReschedule, useRespondReschedule,
} from '../../lib/api'
import { formatDateTime, formatNaira } from '../../lib/format'
import { friendlyError } from '../../lib/supabase'

export function RescheduleBooking() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const { user } = useAuth()
  const booking = useBooking(bookingId, true)
  const history = useBookingReschedules(bookingId)
  const disputes = useDisputes()
  const request = useRequestReschedule()
  const respond = useRespondReschedule()
  const [startAt, setStartAt] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const b = booking.data
  const back = b?.provider_id === user?.id ? '/provider/requests' : '/bookings'
  const busy = request.isPending || respond.isPending

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null)
    setNotice(null)
    try {
      await action()
      setStartAt(null)
      setReason('')
      setNotice(message)
    } catch (err) {
      setError(friendlyError(err))
      void booking.refetch()
      void history.refetch()
    }
  }

  if (booking.isLoading) return <FullScreenLoader />
  if (booking.isError) return <Screen><PageHeader title="Time changes" back="/bookings" />
    <ErrorState message="We could not load this booking." onRetry={() => booking.refetch()} /></Screen>
  if (!b || (b.customer_id !== user?.id && b.provider_id !== user?.id)) {
    return <Screen><PageHeader title="Time changes" back="/bookings" />
      <EmptyState icon="ph-calendar-blank" title="Booking not found" /></Screen>
  }

  const now = Date.now()
  const disputed = disputes.data?.some((d) => d.ref_type === 'booking' && d.ref_id === b.id && d.status === 'open')
  const eligible = (b.status === 'pending' || b.status === 'active') && new Date(b.start_at).getTime() > now
  const canChange = eligible && disputes.isSuccess && !disputed
  const pending = history.data?.find((r) => r.status === 'pending' && new Date(r.proposed_start_at).getTime() > now)
  const sameTime = startAt !== null && new Date(startAt).getTime() === new Date(b.start_at).getTime()

  return <Screen>
    <PageHeader title="Time changes" back={back} />
    <div className="px-[22px] pb-8">
      <div className="bg-white border border-line rounded-2xl p-4 mt-3">
        <h2 className="font-display font-semibold text-xl text-ink">{b.service}</h2>
        <p className="mt-2 text-sm text-muted">Current time: <strong className="text-ink">{formatDateTime(b.start_at)}</strong></p>
        <p className="mt-1 text-sm text-muted">{b.provider_name} · {b.duration_minutes} minutes · {formatNaira(b.price + b.fee)}</p>
      </div>
      <p className="my-4 text-[14px] leading-relaxed text-muted">
        Both of you must agree to a new time. Your current slot stays booked until the change is accepted.
        The price and escrow stay the same. A proposed time is checked for availability again when accepted.
      </p>
      {b.status === 'pending' && <Alert tone="info" className="mb-4">The provider still needs to accept the booking separately.</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}
      {disputed && <Alert className="mb-4">Time changes are paused while this booking has an open dispute.</Alert>}
      {disputes.isError && <ErrorState message="We could not check whether this booking can be changed." onRetry={() => disputes.refetch()} />}
      {!eligible && <Alert tone="info" className="mb-4">This booking has started or closed. You can still view its time change history.</Alert>}

      {history.isLoading && <p role="status" className="text-sm text-muted">Loading time changes…</p>}
      {history.isError && <ErrorState message="We could not load time changes." onRetry={() => history.refetch()} />}

      {pending && <section aria-label="Pending time change" className="bg-white border border-brand rounded-2xl p-4 mb-5">
        <h3 className="font-semibold text-ink">{pending.requested_by === user?.id ? 'Your proposed time' : 'New time proposed'}</h3>
        <p className="mt-2 font-semibold text-ink">{formatDateTime(pending.proposed_start_at)}</p>
        {pending.reason && <p className="mt-2 text-sm text-muted whitespace-pre-wrap">{pending.reason}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          {pending.requested_by === user?.id ? <Button className="w-full" disabled={busy}
            onClick={() => run(() => respond.mutateAsync({ requestId: pending.id, action: 'withdraw' }), 'Proposal withdrawn. The booking time has not changed.')}>
            Withdraw proposal
          </Button> : <>
            <Button className="flex-1" disabled={busy || !canChange}
              onClick={() => run(() => respond.mutateAsync({ requestId: pending.id, action: 'accept' }), 'New time accepted. Your booking has been updated.')}>
              Accept new time
            </Button>
            <Button variant="secondary" className="flex-1" disabled={busy}
              onClick={() => run(() => respond.mutateAsync({ requestId: pending.id, action: 'decline' }), 'Proposal declined. The booking time has not changed.')}>
              Decline
            </Button>
          </>}
        </div>
      </section>}

      {canChange && history.isSuccess && !pending && <form onSubmit={(event) => {
        event.preventDefault()
        if (!startAt || sameTime || busy) return
        void run(() => request.mutateAsync({ bookingId: b.id, startAt, reason }), 'Proposal sent. Your current booking time stays in place until the other person accepts.')
      }}>
        <fieldset disabled={busy}>
          <legend className="font-display font-semibold text-lg text-ink mb-4">Propose a new time</legend>
          <SlotPicker providerId={b.provider_id} bookingId={b.id} durationMinutes={b.duration_minutes} value={startAt} onChange={setStartAt} />
          {sameTime && <p role="alert" className="text-sm text-brand-hover mt-2">Choose a time different from the current booking.</p>}
          <label className="block mt-5 text-sm font-semibold text-ink" htmlFor="reschedule-reason">Reason (optional)</label>
          <textarea id="reschedule-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3}
            className="w-full mt-2 bg-white border border-line rounded-xl p-3 text-ink" />
          <Button type="submit" className="w-full mt-3" loading={request.isPending} disabled={!startAt || sameTime || busy}>Send proposal</Button>
        </fieldset>
      </form>}

      {history.isSuccess && <section aria-label="Time change history" className="mt-6">
        <h3 className="font-display font-semibold text-lg text-ink">History</h3>
        {history.data.length === 0 && <p className="mt-2 text-sm text-muted">No time changes yet.</p>}
        <ol className="mt-3 space-y-3">
          {history.data.map((r) => {
            const expired = r.status === 'pending' && (!eligible || new Date(r.proposed_start_at).getTime() <= now)
            return <li key={r.id} className="bg-white border border-line rounded-xl p-3 text-sm">
              <p className="font-semibold text-ink capitalize">{expired ? 'Expired' : r.status}</p>
              <p className="mt-1 text-muted">{formatDateTime(r.previous_start_at)} → {formatDateTime(r.proposed_start_at)}</p>
              <p className="mt-1 text-muted">Proposed by {r.requested_by === user?.id ? 'you' : 'the other participant'} · {formatDateTime(r.created_at)}</p>
              {r.reason && <p className="mt-2 text-muted whitespace-pre-wrap">{r.reason}</p>}
            </li>
          })}
        </ol>
      </section>}
    </div>
  </Screen>
}
