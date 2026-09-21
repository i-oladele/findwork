import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { PhotoPicker } from '../../components/ui/PhotoPicker'
import { EvidenceGallery } from '../../components/ui/PrivateAttachment'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useBooking, useDispute, useOpenDispute, useOrder } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, shortId } from '../../lib/format'
import type { DisputeRefType } from '../../lib/database.types'

const REASONS = ['Work not completed', 'Not as described', 'Never delivered', 'Damaged', 'Something else']

/** /disputes/new/:refType/:refId — open one. */
export function NewDispute() {
  const { refType, refId } = useParams<{ refType: DisputeRefType; refId: string }>()
  const navigate = useNavigate()
  const open = useOpenDispute()
  const booking = useBooking(refType === 'booking' ? refId : undefined)
  const order = useOrder(refType === 'order' ? refId : undefined)

  const [reason, setReason] = useState(REASONS[0])
  const [details, setDetails] = useState('')
  const [evidence, setEvidence] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const loading = booking.isLoading || order.isLoading
  const subject = refType === 'booking' ? booking.data : order.data

  if (loading) return <FullScreenLoader />
  if (!subject || (refType !== 'booking' && refType !== 'order')) {
    return (
      <Screen>
        <PageHeader title="Report a problem" back="/disputes" />
        <EmptyState icon="ph-scales" title="Nothing to report here" body="We could not find that booking or order." />
      </Screen>
    )
  }

  const label =
    refType === 'booking' ? `${booking.data!.provider_name} · ${booking.data!.service}` : `Order ${shortId(order.data!.id)}`
  const amount = refType === 'booking' ? booking.data!.price + booking.data!.fee : order.data!.total

  async function submit() {
    setError(null)
    try {
      const id = await open.mutateAsync({
        refType: refType as DisputeRefType,
        refId: refId!,
        reason: `${reason}${details.trim() ? ` — ${details.trim()}` : ''}`,
        evidencePaths: evidence,
      })
      navigate(`/disputes/${id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Report a problem" back="/disputes" />
      <div className="px-[22px] pb-6">
        <div className="bg-white border border-line rounded-2xl p-4 mt-4">
          <div className="text-[15.5px] font-semibold text-ink">{label}</div>
          <div className="text-[13px] text-muted-2 mt-0.5">{formatNaira(amount)}</div>
        </div>

        <Alert tone="info" className="mt-4">
          The money stays on hold while our team reads both sides. Nobody can release or cancel it until then.
        </Alert>

        <SectionLabel className="mt-5 mb-2.5">What went wrong</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`rounded-full px-[15px] py-2 text-[13.5px] ${
                reason === r ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <SectionLabel className="mt-4 mb-2">Details</SectionLabel>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="What happened, and what you would like to happen now"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-4 mb-2">Evidence</SectionLabel>
        <PhotoPicker bucket="dispute-evidence" value={evidence} onChange={setEvidence} onError={setError} max={4} />
        <p className="mt-2 text-[13px] text-muted-2">Only you and the FindWork team can see these photos.</p>

        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        <Button onClick={submit} loading={open.isPending} className="w-full">
          Submit report
        </Button>
      </div>
    </Screen>
  )
}

/** /disputes/:id — follow one. */
export function DisputeDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: dispute, isLoading } = useDispute(id)

  if (isLoading) return <FullScreenLoader />
  if (!dispute) {
    return (
      <Screen>
        <PageHeader title="Dispute" back="/disputes" />
        <EmptyState icon="ph-scales" title="Dispute not found" />
      </Screen>
    )
  }

  const mine = dispute.raised_by === user?.id

  return (
    <Screen>
      <PageHeader title="Dispute" back="/disputes" />
      <div className="px-[22px] pb-8">
        <div className="bg-white border border-line rounded-2xl p-[18px] mt-4">
          <div className="flex items-center justify-between">
            {dispute.status === 'open' ? (
              <Badge tone="warning" icon="clock">Under review</Badge>
            ) : (
              <Badge tone="success" icon="check-circle">Resolved</Badge>
            )}
            <span className="text-[12.5px] text-muted-2">{formatDateTime(dispute.opened_at)}</span>
          </div>
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2 mt-3">
            {dispute.ref_type === 'order' ? 'Order' : 'Booking'} {shortId(dispute.ref_id)}
          </div>
          <p className="mt-2 text-[15px] leading-[1.5] text-ink">{dispute.reason}</p>
          <div className="text-[13px] text-muted-2 mt-2">{mine ? 'You reported this' : 'Reported against you'}</div>
        </div>

        {mine && dispute.evidence_paths.length > 0 && <EvidenceGallery paths={dispute.evidence_paths} />}
        {!mine && dispute.evidence_paths.length > 0 && (
          <div className="flex items-center gap-2 mt-3 text-[13.5px] text-muted">
            <i className="ph ph-paperclip" />
            {dispute.evidence_paths.length} photo{dispute.evidence_paths.length === 1 ? '' : 's'} attached
          </div>
        )}

        {dispute.status === 'resolved' ? (
          <div className="bg-white border border-line rounded-2xl p-[18px] mt-4">
            <SectionLabel className="mb-2">Outcome</SectionLabel>
            <div className="text-[15.5px] font-semibold text-ink">
              {dispute.outcome === 'refund'
                ? 'Refunded to the customer'
                : dispute.outcome === 'release'
                  ? 'Paid out to the provider'
                  : 'Closed with no money moved'}
            </div>
            {dispute.resolution_note && <p className="mt-2 text-[14.5px] leading-[1.5] text-text-soft">{dispute.resolution_note}</p>}
            {dispute.resolved_at && <div className="text-[12.5px] text-muted-2 mt-2">{formatDateTime(dispute.resolved_at)}</div>}
          </div>
        ) : (
          <Alert tone="info" className="mt-4">
            A FindWork moderator is reading both sides. The payment is on hold until it is settled, and you will get
            a notification with the outcome.
          </Alert>
        )}
      </div>
    </Screen>
  )
}
