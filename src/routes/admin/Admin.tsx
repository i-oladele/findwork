import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EvidenceGallery } from '../../components/ui/PrivateAttachment'
import { FullScreenLoader } from '../../components/system/States'
import {
  adminFindProfiles,
  useAdminAdjustBalance,
  useAdminDisputes,
  useAdminOrders,
  useAdminReplySupport,
  useAdminReports,
  useAdminProcessWithdrawal,
  useAdminResolveReport,
  useAdminSetOrderStatus,
  useAdminSetVerified,
  useAdminSupport,
  useAdminUnverifiedProviders,
  useAdminWithdrawals,
  useProfile,
  useResolveDispute,
  type FoundProfile,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, parseNaira, shortId } from '../../lib/format'
import type { DisputeOutcome } from '../../lib/database.types'

const TABS = ['Disputes', 'Orders', 'Payouts', 'Reports', 'Support', 'Providers', 'Wallets'] as const
type Tab = (typeof TABS)[number]

/**
 * The operator console: the human side of escrow. Everything here is also
 * enforced server-side (public.is_admin()), so this screen is a convenience,
 * not the security boundary.
 */
export function Admin() {
  const { data: profile, isLoading } = useProfile()
  const [tab, setTab] = useState<Tab>('Disputes')
  const [error, setError] = useState<string | null>(null)

  const disputes = useAdminDisputes()
  const orders = useAdminOrders()
  const withdrawals = useAdminWithdrawals()
  const reports = useAdminReports()
  const support = useAdminSupport()
  const providers = useAdminUnverifiedProviders()

  if (isLoading) return <FullScreenLoader />
  if (!profile?.is_admin) return <Navigate to="/home" replace />

  const counts: Record<Tab, number> = {
    Disputes: disputes.data?.length ?? 0,
    Orders: orders.data?.length ?? 0,
    Payouts: withdrawals.data?.length ?? 0,
    Reports: reports.data?.length ?? 0,
    Support: support.data?.length ?? 0,
    Providers: providers.data?.length ?? 0,
    Wallets: 0,
  }

  return (
    <Screen>
      <PageHeader title="Operations" back="/home" />
      <div className="px-[22px] pb-10">
        <div className="flex gap-2 overflow-x-auto mt-3 -mx-[22px] px-[22px] pb-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setError(null)
              }}
              className={`flex-none inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] ${
                tab === t ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
              }`}
            >
              {t}
              {counts[t] > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full font-mono text-[10px] flex items-center justify-center ${tab === t ? 'bg-brand text-white' : 'bg-brand/10 text-brand-deep'}`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && <Alert className="mt-4">{error}</Alert>}

        <div className="mt-4">
          {tab === 'Disputes' && <DisputesTab onError={setError} />}
          {tab === 'Orders' && <OrdersTab onError={setError} />}
          {tab === 'Payouts' && <PayoutsTab onError={setError} />}
          {tab === 'Reports' && <ReportsTab onError={setError} />}
          {tab === 'Support' && <SupportTab onError={setError} />}
          {tab === 'Providers' && <ProvidersTab onError={setError} />}
          {tab === 'Wallets' && <WalletsTab onError={setError} />}
        </div>
      </div>
    </Screen>
  )
}

type TabProps = { onError: (m: string | null) => void }

function Empty({ text }: { text: string }) {
  return <div className="bg-white border border-line rounded-2xl p-8 text-center text-sm text-muted">{text}</div>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-line rounded-2xl p-4 mb-3">{children}</div>
}

function DisputesTab({ onError }: TabProps) {
  const { data } = useAdminDisputes()
  const resolve = useResolveDispute()
  const [note, setNote] = useState<Record<string, string>>({})

  if (!data?.length) return <Empty text="No open disputes." />

  function settle(id: string, outcome: DisputeOutcome, refType: string) {
    const what =
      outcome === 'refund'
        ? refType === 'booking'
          ? 'Refund the customer in full?'
          : 'Refund this order and mark it returned?'
        : outcome === 'release'
          ? 'Release the escrow to the provider?'
          : 'Close with no money moved?'
    if (!window.confirm(what)) return
    onError(null)
    resolve.mutate({ disputeId: id, outcome, note: note[id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
  }

  return (
    <>
      {data.map((d) => (
        <Panel key={d.id}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-2">
              {d.ref_type} {shortId(d.ref_id)}
            </span>
            <span className="text-[12px] text-muted-2">{formatDateTime(d.opened_at)}</span>
          </div>
          <p className="mt-2 text-[15px] leading-[1.5] text-ink">{d.reason}</p>
          <div className="text-[13px] text-muted-2 mt-2">
            {d.raiser?.full_name ?? 'Someone'} → {d.against?.full_name ?? 'FindWork'}
            {d.evidence_paths.length > 0 && ` · ${d.evidence_paths.length} photo(s)`}
          </div>
          {d.evidence_paths.length > 0 && <EvidenceGallery paths={d.evidence_paths} />}
          <input
            value={note[d.id] ?? ''}
            onChange={(e) => setNote((n) => ({ ...n, [d.id]: e.target.value }))}
            placeholder="Note shown to both sides"
            className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2"
          />
          <div className="flex gap-2 mt-3">
            {d.ref_type === 'booking' && (
              <button
                onClick={() => settle(d.id, 'release', d.ref_type)}
                className="flex-1 h-11 bg-success text-white rounded-lg text-[14px] font-semibold"
              >
                Pay provider
              </button>
            )}
            <button
              onClick={() => settle(d.id, 'refund', d.ref_type)}
              className="flex-1 h-11 bg-brand text-white rounded-lg text-[14px] font-semibold"
            >
              Refund
            </button>
            <button
              onClick={() => settle(d.id, 'dismissed', d.ref_type)}
              className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted"
            >
              Dismiss
            </button>
          </div>
        </Panel>
      ))}
    </>
  )
}

function OrdersTab({ onError }: TabProps) {
  const { data } = useAdminOrders()
  const setStatus = useAdminSetOrderStatus()
  if (!data?.length) return <Empty text="No orders to fulfil." />

  return (
    <>
      {data.map((o) => (
        <Panel key={o.id}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-2">{shortId(o.id)}</span>
            <span className="font-display font-bold text-[15px] text-ink">{formatNaira(o.total)}</span>
          </div>
          <div className="text-[14px] text-ink mt-2">
            {o.order_items.map((it) => `${it.qty}× ${it.name}`).join(', ')}
          </div>
          <div className="text-[13px] text-muted-2 mt-1.5">
            {o.customer?.full_name} · {o.delivery_speed} · {formatDateTime(o.placed_at)}
          </div>
          {o.delivery_address && <div className="text-[13.5px] text-text-soft mt-1.5">{o.delivery_address}</div>}
          {o.contact_phone && <div className="text-[13.5px] text-text-soft">{o.contact_phone}</div>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                onError(null)
                setStatus.mutate(
                  { orderId: o.id, status: o.status === 'placed' ? 'dispatched' : 'delivered' },
                  { onError: (e) => onError(friendlyError(e)) },
                )
              }}
              className="flex-1 h-11 bg-ink text-cream rounded-lg text-[14px] font-semibold"
            >
              Mark {o.status === 'placed' ? 'dispatched' : 'delivered'}
            </button>
          </div>
        </Panel>
      ))}
    </>
  )
}

function PayoutsTab({ onError }: TabProps) {
  const { data } = useAdminWithdrawals()
  const process = useAdminProcessWithdrawal()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!data?.length) return <Empty text="No withdrawals waiting." />

  return (
    <>
      {data.map((w) => (
        <Panel key={w.id}>
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-[17px] text-ink">{formatNaira(w.amount)}</span>
            <span className="text-[12px] text-muted-2">{formatDateTime(w.created_at)}</span>
          </div>
          <div className="text-[14px] text-ink mt-2">{w.profile?.full_name}</div>
          <div className="text-[13.5px] text-text-soft mt-1">
            {w.bank_name} · {w.account_number} · {w.account_name}
          </div>
          <input
            value={note[w.id] ?? ''}
            onChange={(e) => setNote((n) => ({ ...n, [w.id]: e.target.value }))}
            placeholder="Reference or reason"
            className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                if (!window.confirm(`Confirm you have sent ${formatNaira(w.amount)} to ${w.account_name}.`)) return
                onError(null)
                process.mutate({ id: w.id, paid: true, note: note[w.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
              }}
              className="flex-1 h-11 bg-success text-white rounded-lg text-[14px] font-semibold"
            >
              Mark sent
            </button>
            <button
              onClick={() => {
                if (!window.confirm('Reject and return the money to their wallet?')) return
                onError(null)
                process.mutate({ id: w.id, paid: false, note: note[w.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
              }}
              className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted"
            >
              Reject
            </button>
          </div>
        </Panel>
      ))}
    </>
  )
}

function ReportsTab({ onError }: TabProps) {
  const { data } = useAdminReports()
  const resolve = useAdminResolveReport()
  if (!data?.length) return <Empty text="Nothing reported." />

  return (
    <>
      {data.map((r) => (
        <Panel key={r.id}>
          <div className="flex items-center justify-between">
            <Badge tone="warning">{r.target_type}</Badge>
            <span className="text-[12px] text-muted-2">{formatDateTime(r.created_at)}</span>
          </div>
          <p className="mt-2 text-[15px] text-ink">{r.reason}</p>
          {r.details && <p className="mt-1 text-[14px] text-text-soft">{r.details}</p>}
          <div className="text-[12.5px] text-muted-2 mt-2">
            By {r.reporter?.full_name} · target {shortId(r.target_id)}
          </div>
          {r.target_type === 'classified' && (
            <Link to={`/classifieds/${r.target_id}`} className="inline-block mt-2 text-[13.5px] font-semibold text-brand-hover">
              Open listing
            </Link>
          )}
          {r.target_type === 'profile' && (
            <Link to={`/provider/${r.target_id}`} className="inline-block mt-2 text-[13.5px] font-semibold text-brand-hover">
              Open profile
            </Link>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                if (!window.confirm('Take this content down?')) return
                onError(null)
                resolve.mutate({ id: r.id, action: 'remove' }, { onError: (e) => onError(friendlyError(e)) })
              }}
              className="flex-1 h-11 bg-brand text-white rounded-lg text-[14px] font-semibold"
            >
              Remove content
            </button>
            <button
              onClick={() => {
                onError(null)
                resolve.mutate({ id: r.id, action: 'dismiss' }, { onError: (e) => onError(friendlyError(e)) })
              }}
              className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted"
            >
              Dismiss
            </button>
          </div>
        </Panel>
      ))}
    </>
  )
}

function SupportTab({ onError }: TabProps) {
  const { data } = useAdminSupport()
  const reply = useAdminReplySupport()
  const [text, setText] = useState<Record<string, string>>({})
  if (!data?.length) return <Empty text="No open support requests." />

  return (
    <>
      {data.map((s) => (
        <Panel key={s.id}>
          <div className="flex items-center justify-between">
            <Badge tone="neutral">{s.topic}</Badge>
            <span className="text-[12px] text-muted-2">{formatDateTime(s.created_at)}</span>
          </div>
          <p className="mt-2 text-[15px] leading-[1.5] text-ink">{s.message}</p>
          <div className="text-[12.5px] text-muted-2 mt-2">{s.profile?.full_name}</div>
          <textarea
            value={text[s.id] ?? ''}
            onChange={(e) => setText((t) => ({ ...t, [s.id]: e.target.value }))}
            rows={2}
            placeholder="Reply"
            className="w-full mt-3 bg-cream rounded-lg p-3 text-[14px] text-ink outline-none resize-none placeholder:text-muted-2"
          />
          <button
            onClick={() => {
              onError(null)
              reply.mutate({ id: s.id, reply: text[s.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}
            disabled={!(text[s.id] ?? '').trim()}
            className="w-full h-11 mt-3 bg-ink text-cream rounded-lg text-[14px] font-semibold disabled:opacity-50"
          >
            Send reply and close
          </button>
        </Panel>
      ))}
    </>
  )
}

function ProvidersTab({ onError }: TabProps) {
  const { data } = useAdminUnverifiedProviders()
  const setVerified = useAdminSetVerified()
  if (!data?.length) return <Empty text="Every provider is verified." />

  return (
    <>
      {data.map((p) => (
        <Panel key={p.id}>
          <div className="flex items-center justify-between gap-2">
            <Link to={`/provider/${p.id}`} className="font-display font-semibold text-[16px] text-ink truncate">
              {p.business_name}
            </Link>
            <span className="text-[12px] text-muted-2">{p.jobs_done} jobs</span>
          </div>
          <div className="text-[13px] text-muted-2 mt-1">
            {p.category} · {p.location}
          </div>
          {p.bio && <p className="mt-2 text-[13.5px] leading-[1.45] text-text-soft line-clamp-3">{p.bio}</p>}
          <button
            onClick={() => {
              if (!window.confirm(`Mark ${p.business_name} as verified?`)) return
              onError(null)
              setVerified.mutate({ providerId: p.id, verified: true }, { onError: (e) => onError(friendlyError(e)) })
            }}
            className="w-full h-11 mt-3 bg-success text-white rounded-lg text-[14px] font-semibold"
          >
            Mark verified
          </button>
        </Panel>
      ))}
    </>
  )
}

function WalletsTab({ onError }: TabProps) {
  const adjust = useAdminAdjustBalance()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundProfile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('Test funds')

  async function search() {
    setBusy(true)
    onError(null)
    try {
      setResults(await adminFindProfiles(query.trim()))
    } catch (err) {
      onError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel>
        <SectionLabel className="mb-2">Find someone</SectionLabel>
        <Input value={query} onChange={setQuery} placeholder="Name, email or phone (3+ characters)" icon="magnifying-glass" />
        <Input label="Reason (shown in their ledger)" value={reason} onChange={setReason} />
        <Button onClick={search} disabled={query.trim().length < 3} loading={busy} className="mt-3 w-full h-12">
          Search
        </Button>
      </Panel>

      {results?.length === 0 && <Empty text="Nobody matches that." />}
      {results?.map((p) => (
        <Panel key={p.id}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-[15.5px] text-ink truncate">{p.full_name}</span>
            <span className="font-display font-bold text-[15px] text-ink">{formatNaira(p.balance)}</span>
          </div>
          <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">
            {p.email} {p.phone ? `· ${p.phone}` : ''}
          </div>
          <div className="flex gap-2 mt-3">
            <div className="flex-1 flex items-center bg-cream rounded-lg h-11 px-3">
              <span className="font-display font-bold text-ink">₦</span>
              <input
                value={amount[p.id] ?? ''}
                onChange={(e) => setAmount((a) => ({ ...a, [p.id]: e.target.value }))}
                inputMode="numeric"
                placeholder="5000"
                aria-label={`Amount for ${p.full_name}`}
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-ink"
              />
            </div>
            <button
              onClick={() => {
                const value = parseNaira(amount[p.id] ?? '')
                if (!value || !window.confirm(`Add ${formatNaira(value)} to ${p.full_name}'s wallet?`)) return
                onError(null)
                adjust.mutate(
                  { profileId: p.id, amount: value, reason: reason.trim() || 'Adjustment' },
                  { onError: (e) => onError(friendlyError(e)) },
                )
              }}
              className="px-4 h-11 bg-success text-white rounded-lg text-[14px] font-semibold"
            >
              Credit
            </button>
            <button
              onClick={() => {
                const value = parseNaira(amount[p.id] ?? '')
                if (!value || !window.confirm(`Take ${formatNaira(value)} from ${p.full_name}'s wallet?`)) return
                onError(null)
                adjust.mutate(
                  { profileId: p.id, amount: -value, reason: reason.trim() || 'Adjustment' },
                  { onError: (e) => onError(friendlyError(e)) },
                )
              }}
              className="px-4 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted"
            >
              Debit
            </button>
          </div>
        </Panel>
      ))}
    </>
  )
}
