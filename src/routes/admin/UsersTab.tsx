import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import {
  adminFindProfiles,
  useAdminReinstateUser,
  useAdminSetStaffRole,
  useAdminSuspendUser,
  useAdminUserOverview,
  useStaff,
  useTrust,
  useUserActivity,
  type FoundProfile,
  type UserOverview,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'
import { STAFF_ROLE_LABEL, type StaffRole } from '../../lib/staff'

const panel = 'bg-white border border-line rounded-2xl p-4 mb-3'

/** Find an account, see it at a glance, and suspend, reinstate or change its role. */
export function UsersTab({ onError }: { onError: (message: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundProfile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  async function search() {
    setBusy(true)
    onError(null)
    try {
      setResults(await adminFindProfiles(query.trim()))
      setSelected(null)
    } catch (err) {
      onError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={panel}>
        <SectionLabel className="mb-2">Find an account</SectionLabel>
        <Input value={query} onChange={setQuery} placeholder="Name, email or phone (3+ characters)" icon="magnifying-glass" />
        <Button onClick={search} disabled={query.trim().length < 3} loading={busy} className="mt-3 h-12">Search</Button>
      </div>
      {results?.length === 0 && <p className="text-center text-[14px] text-muted py-8">Nobody matches that.</p>}
      {results?.map((p) => (
        <div key={p.id} className={panel}>
          <button className="w-full text-left" onClick={() => setSelected(selected === p.id ? null : p.id)} aria-expanded={selected === p.id}>
            <div className="font-display font-semibold text-[15.5px] text-ink truncate">{p.full_name || 'No name'}</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">{p.email} {p.phone ? `· ${p.phone}` : ''}</div>
          </button>
          {selected === p.id && <UserPanel profileId={p.id} onError={onError} />}
        </div>
      ))}
    </>
  )
}

function UserPanel({ profileId, onError }: { profileId: string; onError: (message: string | null) => void }) {
  const overview = useAdminUserOverview(profileId)
  return (
    <div className="mt-3 border-t border-line pt-3">
      <QueryState query={overview} errorMessage="We could not load this account." skeletonRows={1}>
        {(user) => <UserDetail user={user} onError={onError} />}
      </QueryState>
    </div>
  )
}

function UserDetail({ user, onError }: { user: UserOverview; onError: (message: string | null) => void }) {
  const staff = useStaff()
  const suspend = useAdminSuspendUser()
  const reinstate = useAdminReinstateUser()
  const setRole = useAdminSetStaffRole()
  const { data: trust } = useTrust(user.id)
  const { data: activity } = useUserActivity(user.id)
  const [reason, setReason] = useState('')
  const pending = suspend.isPending || reinstate.isPending || setRole.isPending
  const run = (action: Promise<unknown>) => { onError(null); action.catch((err) => onError(friendlyError(err))) }

  return (
    <div className="space-y-3 text-[13.5px] text-text-soft">
      <div className="flex flex-wrap gap-1.5">
        {user.suspended_at && <Badge tone="danger" icon="prohibit">Suspended</Badge>}
        {user.deleted_at && <Badge tone="neutral">Deleted</Badge>}
        {user.verified_at && <Badge tone="success" icon="seal-check">ID verified</Badge>}
        {user.is_provider && <Badge tone="neutral">Provider</Badge>}
        {user.staff_role && <Badge tone="warning">{user.staff_role}</Badge>}
        {user.open_alerts > 0 && <Badge tone="danger" icon="warning">{user.open_alerts} open alert{user.open_alerts === 1 ? '' : 's'}</Badge>}
      </div>
      {user.suspended_reason && <Alert tone="info">Suspended {formatDateTime(user.suspended_at!)}: {user.suspended_reason}</Alert>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Fact label="Joined" value={formatDateTime(user.created_at)} />
        {trust && <Fact label="Trust score" value={`${trust.score} · tier ${trust.tier} · conduct ${trust.conduct ?? '–'}/20`} />}
        {user.balance !== null && <Fact label="Wallet" value={formatNaira(user.balance)} />}
        {user.escrow_held !== null && <Fact label="In escrow" value={formatNaira(user.escrow_held)} />}
        <Fact label="Bookings" value={user.bookings} />
        <Fact label="Orders" value={user.orders} />
        <Fact label="Disputes raised" value={user.disputes_raised} />
        <Fact label="Disputes against" value={`${user.disputes_against} (${user.disputes_lost} lost)`} />
        <Fact label="Reports against" value={user.reports_against} />
      </dl>

      {staff.can('users') && !user.deleted_at && (
        <div className="border-t border-line pt-3">
          {user.suspended_at ? (
            <button disabled={pending} className="min-h-11 font-semibold text-success-text" onClick={() => {
              if (window.confirm(`Reinstate ${user.full_name}?`)) run(reinstate.mutateAsync({ profileId: user.id, note: reason }))
            }}>Reinstate account</button>
          ) : (
            <>
              <label className="block">Reason shown to the account holder
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
                  className="block w-full mt-1 bg-cream rounded-lg p-2.5 text-ink outline-none" />
              </label>
              <button disabled={pending || reason.trim().length < 3} className="min-h-11 font-semibold text-danger disabled:opacity-50" onClick={() => {
                if (window.confirm(`Suspend ${user.full_name}? They will not be able to book, sell, pay or message.`)) {
                  run(suspend.mutateAsync({ profileId: user.id, reason }).then(() => setReason('')))
                }
              }}>Suspend account</button>
            </>
          )}
        </div>
      )}

      {staff.can('roles') && !user.deleted_at && (
        <label className="block border-t border-line pt-3">Staff role
          <select disabled={pending} value={user.staff_role ?? ''} className="block w-full mt-1 bg-cream rounded-lg p-2.5 text-ink"
            onChange={(e) => {
              const role = (e.target.value || null) as StaffRole | null
              if (window.confirm(role ? `Make ${user.full_name} ${role}?` : `Remove ${user.full_name} from staff?`)) run(setRole.mutateAsync({ profileId: user.id, role }))
            }}>
            <option value="">Not staff</option>
            {(Object.keys(STAFF_ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      )}

      {activity && (
        <div className="border-t border-line pt-3">
          <div className="font-semibold text-ink">App use, last 30 days</div>
          {activity.opted_out ? <p>This person has turned usage analytics off; nothing is recorded.</p>
            : !activity.recorded ? <p>Nothing recorded.</p>
              : <p>{activity.sessions} visit{activity.sessions === 1 ? '' : 's'}, {activity.page_views} screens opened{activity.last_seen ? `, last seen ${formatDateTime(activity.last_seen)}` : ''}. Most used: {activity.top_screens.slice(0, 4).map((s) => s.path).join(', ') || 'none'}.</p>}
        </div>
      )}

      <History title="Devices" rows={user.devices.map((d) => `${d.label || 'Unknown device'} · last seen ${formatDateTime(d.last_seen_at)}${d.last_ip ? ` · ${d.last_ip}` : ''}`)} />
      <History title="Security events" rows={user.events.map((e) => `${e.kind.replace(/_/g, ' ')} · ${formatDateTime(e.created_at)}`)} />
      <History title="Staff actions on this account" rows={user.actions.map((a) => `${a.action.replace(/_/g, ' ')} · ${formatDateTime(a.created_at)}`)} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-[11.5px] text-muted-2">{label}</dt><dd className="text-ink font-semibold">{value}</dd></div>
}

function History({ title, rows }: { title: string; rows: string[] }) {
  if (rows.length === 0) return null
  return (
    <details className="border-t border-line pt-2">
      <summary className="cursor-pointer py-2 font-semibold text-ink">{title} ({rows.length})</summary>
      <ul className="space-y-1.5">{rows.map((row, i) => <li key={i}>{row}</li>)}</ul>
    </details>
  )
}
