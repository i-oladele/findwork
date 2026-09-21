import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { FullScreenLoader } from '../../components/system/States'
import { useBooking, useLeaveReview, useMyReviewedBookingIds } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'

const LABELS = ['', 'Poor', 'Below expectations', 'Okay', 'Good', 'Excellent']

export function WriteReview() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const { data: booking, isLoading } = useBooking(bookingId)
  const { data: reviewed } = useMyReviewedBookingIds()
  const leave = useLeaveReview()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />

  const blocked = !booking
    ? 'We could not find that booking.'
    : booking.status !== 'done'
      ? 'You can review once you have marked the job as done.'
      : reviewed?.has(booking.id)
        ? 'You have already reviewed this booking. Thank you.'
        : null

  async function submit() {
    if (!booking || rating === 0) return
    setError(null)
    try {
      await leave.mutateAsync({ bookingId: booking.id, providerId: booking.provider_id, rating, body: body.trim() })
      navigate('/bookings', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Leave a review" back="/bookings" icon="x" />
      <div className="px-[22px] pb-8">
        {blocked || !booking ? (
          <Alert tone="info" className="mt-5">
            {blocked}
          </Alert>
        ) : (
          <>
            <div className="bg-white border border-line rounded-2xl p-4 mt-4">
              <div className="font-display font-semibold text-[16.5px] text-ink">{booking.provider_name}</div>
              <div className="text-[13.5px] text-muted mt-1">
                {booking.service} · {formatDateTime(booking.start_at)}
              </div>
            </div>

            <SectionLabel className="mt-6 mb-3">How did it go?</SectionLabel>
            <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onClick={() => setRating(n)}
                  className="w-12 h-12 flex items-center justify-center"
                >
                  <i className={`${n <= rating ? 'ph-fill text-warning' : 'ph text-muted-4'} ph-star text-[34px]`} />
                </button>
              ))}
            </div>
            <div className="text-center text-[14px] text-muted mt-1 h-5">{LABELS[rating]}</div>

            <SectionLabel className="mt-5 mb-2">Tell others about it</SectionLabel>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Quality of the work, timekeeping, how they communicated"
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
            />
            <p className="mt-2 text-[13px] text-muted-2">Reviews are public and show your name.</p>

            {error && <Alert className="mt-4">{error}</Alert>}
            <Button onClick={submit} disabled={rating === 0} loading={leave.isPending} className="mt-5 w-full">
              Post review
            </Button>
          </>
        )}
      </div>
    </Screen>
  )
}
