import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { QueryState } from '../../components/system/QueryState'
import { useAdminHandleSos, useAdminSos, useAdminTakeSos, useProfile, useReviewRiskAlert, useRiskAlerts, useSosRota, useStaff } from '../../lib/api'
import { mapLink } from '../../lib/safety'
import { minutesSince, onCallAt, upcomingGaps } from '../../lib/rota'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatTime } from '../../lib/format'

const tone = { high: 'danger', medium: 'warning', low: 'neutral' } as const

/**
 * What the automatic checks flagged: unusual sign-ins, money movements and
 * listings. A flag is a prompt to look, never a decision; only a person
 * suspends an account or reverses a payment.
 */
export function RiskTab({ onError }: { onError: (message: string | null) => void }) {
  const alerts = useRiskAlerts()
  const review = useReviewRiskAlert()
  const [note, setNote] = useState<Record<string, string>>({})

  return (
    <>
    <SosQueue onError={onError} />
    <QueryState query={alerts} errorMessage="We could not load the risk queue." empty={{ icon: 'ph-shield-check', title: 'Nothing flagged', body: 'New alerts appear here as the checks raise them.' }}>
      {(rows) => rows.map((a) => (
        <div key={a.id} className="bg-white border border-line rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-[15px] text-ink truncate">{a.profile?.full_name || 'Unknown account'}</span>
            <Badge tone={tone[a.severity]}>{a.severity}</Badge>
          </div>
          <p className="mt-1.5 text-[14px] leading-[1.45] text-text-soft">{a.summary}</p>
          <div className="mt-1 text-[12px] text-muted-2">{a.kind.replace(/_/g, ' ')} · {formatDateTime(a.created_at)}</div>
          <input value={note[a.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))} maxLength={500}
            placeholder="What you found (optional)" aria-label={`Review note for ${a.profile?.full_name ?? 'this alert'}`}
            className="w-full mt-3 bg-cream rounded-lg h-11 px-3 text-[14px] text-ink outline-none" />
          <div className="flex gap-4 mt-1 text-[14px] font-semibold">
            {(['reviewed', 'dismissed'] as const).map((status) => (
              <button key={status} disabled={review.isPending} className={`min-h-11 ${status === 'reviewed' ? 'text-brand' : 'text-muted'}`} onClick={() => {
                onError(null)
                review.mutate({ id: a.id, status, note: note[a.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
              }}>{status === 'reviewed' ? 'Mark reviewed' : 'Dismiss'}</button>
            ))}
          </div>
        </div>
      ))}
    </QueryState>
    </>
  )
}

/** Who is on call for SOS now, and whether anyone is. Links to the rota. */
function OnCallNow() {
  const rota = useSosRota(2)
  if (!rota.data) return null
  const now = onCallAt(rota.data.shifts, rota.data.gaps)
  const next = upcomingGaps(rota.data.gaps).find((g) => new Date(g.starts_at).getTime() > Date.now())
  return (
    <div className={`rounded-2xl p-4 mb-3 border ${now.uncovered ? 'bg-danger-bg border-danger' : 'bg-white border-line'}`}>
      <div className={`font-display font-semibold text-[15px] ${now.uncovered ? 'text-danger' : 'text-ink'}`}>
        {now.uncovered ? 'Nobody is on call for SOS right now' : `On call for SOS: ${now.primary}`}
      </div>
      <p className="mt-1 text-[13.5px] text-text-soft">
        {now.backup ? `Backup: ${now.backup}. ` : 'No backup. '}
        {now.uncovered ? 'An SOS now goes to every admin and moderator, and nobody in particular is expected to answer.'
          : next ? `Next gap from ${formatDateTime(next.starts_at)}.` : 'Covered for the next two days.'}
      </p>
      <Link to="/admin/on-call" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand underline">SOS on-call rota</Link>
    </div>
  )
}

/** People who pressed SOS. Take it, call them, and record what was done to close it. */
function SosQueue({ onError }: { onError: (message: string | null) => void }) {
  const staff = useStaff()
  const { data: me } = useProfile()
  const sos = useAdminSos()
  const take = useAdminTakeSos()
  const handle = useAdminHandleSos()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!staff.can('users')) return null
  return (
    <>
      <OnCallNow />
      {sos.data?.map((a) => {
        const mine = a.acknowledged_by === me?.id
        const name = a.full_name || 'Unknown account'
        return (
          <div key={a.id} className="bg-danger-bg border-[1.5px] border-danger rounded-2xl p-4 mb-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-[16px] text-danger">SOS · {name}</span>
              <span className="text-[12px] text-danger">{formatDateTime(a.created_at)}</span>
            </div>
            {a.acknowledged_by ? (
              <p className="mt-1.5 text-[14px] text-ink">{mine ? 'You' : a.acknowledged_name || 'A member of staff'} took this at {formatTime(a.acknowledged_at!)}.</p>
            ) : (
              <>
                <p className="mt-1.5 text-[14px] font-semibold text-danger">
                  Nobody has taken this yet ({minutesSince(a.created_at)} min).{' '}
                  <span className="font-normal text-ink">{a.assigned_name ? `On call: ${a.assigned_to === me?.id ? 'you' : a.assigned_name}.` : 'Nobody was on call.'}</span>
                </p>
                <button disabled={take.isPending} className="mt-2 w-full h-12 rounded-xl bg-danger text-white font-semibold text-[16px] disabled:opacity-50" onClick={() => {
                  onError(null)
                  take.mutate(a.id, { onError: (e) => onError(friendlyError(e)) })
                }}>I'm on it</button>
              </>
            )}
            {a.note && <p className="mt-2 text-[14px] text-ink">“{a.note}”</p>}
            {a.phone
              ? <a href={`tel:${a.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-danger underline"><i className="ph ph-phone" aria-hidden />Call {a.phone}</a>
              : <p className="mt-1.5 text-[13.5px] text-ink">There is no phone number on the account. Look for another way to reach them under Users.</p>}
            {a.lat != null && a.lng != null
              ? <a href={mapLink(a.lat, a.lng)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-[14px] font-semibold text-danger underline">Open their location in a map</a>
              : <p className="mt-1.5 text-[13.5px] text-ink">No location was shared.</p>}
            {a.meetup_title && (
              <p className="mt-1 text-[13.5px] text-ink">
                Meeting {a.other_name || 'someone'} for “{a.meetup_title}” at {a.meetup_place}{a.meet_at ? `, ${formatDateTime(a.meet_at)}` : ''}.
              </p>
            )}
            <input value={note[a.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))} maxLength={500}
              placeholder="What was done (they will see this)" aria-label={`Response to ${name}`}
              className="w-full mt-2 bg-white rounded-lg h-11 px-3 text-[14px] text-ink outline-none" />
            <button disabled={handle.isPending || (note[a.id] ?? '').trim().length < 3} className="min-h-11 mt-1 text-[14px] font-semibold text-danger disabled:opacity-50" onClick={() => {
              onError(null)
              handle.mutate({ id: a.id, note: note[a.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}>Mark handled</button>
          </div>
        )
      })}
    </>
  )
}
