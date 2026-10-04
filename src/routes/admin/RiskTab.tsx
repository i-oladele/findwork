import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { QueryState } from '../../components/system/QueryState'
import { useAdminHandleSos, useAdminSos, useReviewRiskAlert, useRiskAlerts, useStaff } from '../../lib/api'
import { mapLink } from '../../lib/safety'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'

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

/** People who pressed SOS. Call them first; record what was done to close it. */
function SosQueue({ onError }: { onError: (message: string | null) => void }) {
  const staff = useStaff()
  const sos = useAdminSos()
  const handle = useAdminHandleSos()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!staff.can('users') || !sos.data?.length) return null
  return (
    <>
      {sos.data.map((a) => (
        <div key={a.id} className="bg-danger-bg border-[1.5px] border-danger rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-bold text-[16px] text-danger">SOS · {a.profile?.full_name || 'Unknown account'}</span>
            <span className="text-[12px] text-danger">{formatDateTime(a.created_at)}</span>
          </div>
          {a.note && <p className="mt-1.5 text-[14px] text-ink">{a.note}</p>}
          {a.lat != null && a.lng != null
            ? <a href={mapLink(Number(a.lat), Number(a.lng))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-danger underline">Open their location in a map</a>
            : <p className="mt-1.5 text-[13.5px] text-ink">No location was shared.</p>}
          <p className="text-[13px] text-ink">Find their phone number under Users, and call them.</p>
          <input value={note[a.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))} maxLength={500}
            placeholder="What was done (they will see this)" aria-label={`Response to ${a.profile?.full_name ?? 'this SOS'}`}
            className="w-full mt-2 bg-white rounded-lg h-11 px-3 text-[14px] text-ink outline-none" />
          <button disabled={handle.isPending || (note[a.id] ?? '').trim().length < 3} className="min-h-11 mt-1 text-[14px] font-semibold text-danger disabled:opacity-50" onClick={() => {
            onError(null)
            handle.mutate({ id: a.id, note: note[a.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
          }}>Mark handled</button>
        </div>
      ))}
    </>
  )
}
