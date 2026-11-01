import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { useRemoveSosShift, useSaveSosShift, useSosRota, useSosStaff, useStaff } from '../../lib/api'
import { fromLagosInput, onCallAt, shiftForGap, toLagosInput, upcomingGaps } from '../../lib/rota'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import type { SosDuty } from '../../lib/database.types'

const DAYS = 14
const field = 'block w-full mt-1 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-ink'

/**
 * Who answers an SOS, and when. Admins keep the rota; every member of staff
 * who handles SOS alerts can see it.
 */
export function OnCallRota() {
  const staff = useStaff()
  const rota = useSosRota(DAYS)
  const remove = useRemoveSosShift()
  const [error, setError] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<{ startsAt: Date; endsAt: Date } | null>(null)
  if (!staff.can('users')) return <Navigate to="/home" replace />
  const isAdmin = staff.role === 'admin'

  return (
    <Screen>
      <PageHeader title="SOS on-call rota" back="/admin" />
      <div className="px-[22px] pb-10">
        <p className="mt-2 text-[14px] leading-[1.5] text-text-soft">
          An SOS goes first to the primary on call, who presses “I'm on it” and calls the person. If nobody has taken it after
          2 minutes it goes to the backup and every admin; after 5 minutes, and every 5 minutes after that, to every admin and
          moderator. SOS pushes reach staff even when they have muted notifications. Times are Lagos time.
        </p>
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState query={rota} errorMessage="We could not load the rota.">
          {({ shifts, gaps }) => {
            const now = onCallAt(shifts, gaps)
            const ahead = upcomingGaps(gaps)
            return (
              <>
                <div className={`mt-4 rounded-2xl p-4 border ${now.uncovered ? 'bg-danger-bg border-danger' : 'bg-white border-line'}`}>
                  <div className={`font-display font-semibold text-[15.5px] ${now.uncovered ? 'text-danger' : 'text-ink'}`}>
                    {now.uncovered ? 'Nobody is on call right now' : `On call now: ${now.primary}`}
                  </div>
                  <div className="mt-1 text-[13.5px] text-text-soft">{now.backup ? `Backup: ${now.backup}` : 'No backup now'}</div>
                </div>

                <SectionLabel className="mt-6">Nobody on call · next {DAYS} days</SectionLabel>
                {ahead.length === 0 ? (
                  <p className="mt-2 text-[14px] text-text-soft">Every hour is covered.</p>
                ) : ahead.map((g) => (
                  <div key={g.starts_at} className="flex items-center justify-between gap-3 bg-danger-bg rounded-xl px-3.5 py-2.5 mt-2">
                    <span className="text-[14px] text-ink">{formatDateTime(g.starts_at)} to {formatDateTime(g.ends_at)}</span>
                    {isAdmin && (
                      <button className="min-h-11 text-[14px] font-semibold text-danger underline" onClick={() => setPrefill(shiftForGap(g))}>Fill</button>
                    )}
                  </div>
                ))}

                <SectionLabel className="mt-6">Shifts</SectionLabel>
                {shifts.length === 0 ? (
                  <p className="mt-2 text-[14px] text-text-soft">No shifts yet.</p>
                ) : shifts.map((s) => {
                  const started = new Date(s.starts_at).getTime() <= Date.now()
                  return (
                    <div key={s.id} className="bg-white border border-line rounded-2xl p-4 mt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-semibold text-[15px] text-ink truncate">{s.staff?.full_name || 'A member of staff'}</span>
                        <Badge tone={s.duty === 'primary' ? 'warning' : 'neutral'}>{s.duty}</Badge>
                      </div>
                      <div className="mt-1 text-[13.5px] text-text-soft">{formatDateTime(s.starts_at)} to {formatDateTime(s.ends_at)}</div>
                      {isAdmin && (
                        <button disabled={remove.isPending} className="min-h-11 text-[14px] font-semibold text-muted" onClick={() => {
                          setError(null)
                          remove.mutate(s.id, { onError: (e) => setError(friendlyError(e)) })
                        }}>{started ? 'End this shift now' : 'Remove'}</button>
                      )}
                    </div>
                  )
                })}
              </>
            )
          }}
        </QueryState>

        {isAdmin && <AddShift key={prefill?.startsAt.toISOString() ?? 'blank'} prefill={prefill} onError={setError} />}
      </div>
    </Screen>
  )
}

function AddShift({ prefill, onError }: { prefill: { startsAt: Date; endsAt: Date } | null; onError: (message: string | null) => void }) {
  const people = useSosStaff()
  const save = useSaveSosShift()
  const hour = Math.ceil(Date.now() / 3_600_000) * 3_600_000
  const [staffId, setStaffId] = useState('')
  const [duty, setDuty] = useState<SosDuty>('primary')
  const [starts, setStarts] = useState(toLagosInput(prefill?.startsAt ?? new Date(hour)))
  const [ends, setEnds] = useState(toLagosInput(prefill?.endsAt ?? new Date(hour + 12 * 3_600_000)))
  const startsAt = fromLagosInput(starts)
  const endsAt = fromLagosInput(ends)
  const ready = staffId && startsAt && endsAt && endsAt > startsAt

  return (
    <div className="mt-8">
      <SectionLabel>Add a shift</SectionLabel>
      <label className="block mt-3 text-[13px] font-semibold text-ink">Who
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={field}>
          <option value="">Choose an admin or moderator</option>
          {people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'} · {p.staff_role}</option>)}
        </select>
      </label>
      <label className="block mt-3 text-[13px] font-semibold text-ink">Duty
        <select value={duty} onChange={(e) => setDuty(e.target.value as SosDuty)} className={field}>
          <option value="primary">Primary: answers first</option>
          <option value="backup">Backup: called in after 2 minutes</option>
        </select>
      </label>
      <label className="block mt-3 text-[13px] font-semibold text-ink">Starts (Lagos time)
        <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={field} />
      </label>
      <label className="block mt-3 text-[13px] font-semibold text-ink">Ends (Lagos time)
        <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={field} />
      </label>
      <p className="mt-2 text-[13px] text-text-soft">A shift can be up to 7 days. The person is told when they are put on call.</p>
      <Button className="mt-4" disabled={!ready} loading={save.isPending} onClick={() => {
        onError(null)
        save.mutate({ staffId, duty, startsAt: startsAt!, endsAt: endsAt! }, { onError: (e) => onError(friendlyError(e)) })
      }}>Add shift</Button>
    </div>
  )
}
