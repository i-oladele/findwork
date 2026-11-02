import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { useAdminLiveVideo, useLiveVideoAvailable, useSetLiveVideoPolicy, useStaff, type LiveVideoPolicy } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'

const STATE = {
  open: { tone: 'success', label: 'Open' },
  paused: { tone: 'warning', label: 'New camera streams paused' },
  stopped: { tone: 'danger', label: 'Stopped' },
} as const

const FIELDS: { key: keyof LiveVideoPolicy; label: string; hint: string }[] = [
  { key: 'plan_minutes', label: 'Minutes in the LiveKit plan', hint: 'Per cycle; 5,000 on the free plan' },
  { key: 'seller_minutes', label: 'Each seller’s share', hint: 'Minutes per seller per cycle' },
  { key: 'stream_minutes', label: 'Longest stream', hint: 'Minutes once live' },
  { key: 'preview_minutes', label: 'Camera check', hint: 'Minutes before going live' },
  { key: 'max_viewers', label: 'Viewers at once', hint: 'Per stream' },
  { key: 'cycle_day', label: 'Cycle starts on day', hint: 'The day LiveKit’s month starts (1–28)' },
]

/**
 * Live video inside FindWork this cycle: how much of the shared LiveKit pool
 * is used, by whom, and the fair-use limits (live_video_tick). Admins change
 * the limits here.
 */
export function LiveVideoUsage() {
  const staff = useStaff()
  const { data: configured } = useLiveVideoAvailable()
  const usage = useAdminLiveVideo(staff.can('analytics'))
  if (!usage.data) return null
  const u = usage.data
  const pauseAt = Math.floor(u.policy.plan_minutes * 0.9)
  const stopAt = Math.floor(u.policy.plan_minutes * 0.98)
  const share = Math.min(100, Math.round((u.used / Math.max(1, u.policy.plan_minutes)) * 100))
  return (
    <section className="bg-white rounded-xl border border-line p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-lg">Live video this cycle</h3>
        <Badge tone={STATE[u.state].tone}>{STATE[u.state].label}</Badge>
      </div>
      {!configured && <p className="text-sm text-muted">FindWork video is not switched on yet (LiveKit keys). These limits apply once it is.</p>}
      <div>
        <div className="font-display font-bold text-xl">{u.used.toLocaleString('en-NG')} of {u.policy.plan_minutes.toLocaleString('en-NG')} minutes</div>
        <div className="mt-1.5 h-2 rounded-full bg-cream overflow-hidden" role="progressbar" aria-label="Live video used" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${u.state === 'open' ? 'bg-brand' : 'bg-danger'}`} style={{ width: `${share}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-muted">
          Since {formatDateTime(u.cycle_start)}; resets {formatDateTime(u.resets_at)}. New camera streams pause at {pauseAt.toLocaleString('en-NG')};
          every FindWork video stream stops at {stopAt.toLocaleString('en-NG')}. Streams with a link are never limited.
        </p>
      </div>
      {u.sellers.length > 0 && (
        <table className="w-full text-sm text-left">
          <caption className="text-left font-semibold mb-1">Most used, this cycle</caption>
          <tbody>
            {u.sellers.map((s) => (
              <tr key={s.seller_id} className="border-t border-line-soft">
                <th scope="row" className="py-1.5 font-normal truncate">{s.name || 'A seller'}</th>
                <td className="py-1.5 text-right">{s.minutes.toLocaleString('en-NG')} of {u.policy.seller_minutes.toLocaleString('en-NG')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {staff.role === 'admin' && <PolicyForm key={JSON.stringify(u.policy)} policy={u.policy} />}
    </section>
  )
}

function PolicyForm({ policy }: { policy: LiveVideoPolicy }) {
  const save = useSetLiveVideoPolicy()
  const [draft, setDraft] = useState<Record<keyof LiveVideoPolicy, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, String(policy[f.key])])) as Record<keyof LiveVideoPolicy, string>,
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key])])) as LiveVideoPolicy
  const valid = FIELDS.every((f) => /^\d+$/.test(draft[f.key].trim()))
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-ink py-2">Change the limits</summary>
      <div className="grid grid-cols-2 gap-3 mt-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="font-semibold text-ink">{f.label}</span>
            <input inputMode="numeric" value={draft[f.key]} onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [f.key]: e.target.value })) }}
              className="w-full mt-1 bg-cream rounded-lg h-11 px-3 text-ink outline-none" />
            <span className="text-xs text-muted">{f.hint}</span>
          </label>
        ))}
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
      {saved && <p className="mt-3 text-success-text">Saved. The new limits apply from the next minute.</p>}
      <button disabled={!valid || save.isPending} className="mt-3 min-h-11 font-semibold text-brand disabled:opacity-50" onClick={() => {
        setError(null)
        save.mutate(parsed, { onSuccess: () => setSaved(true), onError: (e) => setError(friendlyError(e)) })
      }}>Save the limits</button>
    </details>
  )
}
