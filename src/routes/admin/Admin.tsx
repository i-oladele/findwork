import { askAssistant, AssistantUnavailable, type DisputeSummary } from '../../lib/api/assistant'
import { useState } from 'react'
import { DisputeConversation } from '../../components/ui/DisputeConversation'
import { UsersTab } from './UsersTab'
import { RiskTab } from './RiskTab'
import { LogisticsTab } from './LogisticsTab'
import type { StaffArea } from '../../lib/staff'
import { Link, Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EvidenceGallery, PrivatePhoto } from '../../components/ui/PrivateAttachment'
import { FullScreenLoader } from '../../components/system/States'
import { useIdentityChecks, useRunIdentityCheck } from '../../lib/api/verification'
import {
  adminFindProfiles,
  useAdminAdjustBalance,
  useAdminBusinessVerifications,
  useAdminHeldPurchaseOrders,
  useAdminResolvePurchaseOrder,
  useAdminSos,
  useAdminDeliveries,
  useAdminRiders,
  useAdminReviewBusinessVerification,
  useAdminDisputes,
  useAdminMarkTopupRefunded,
  useAdminOrders,
  useAdminRequeuePayout,
  useAdminRetryPayout,
  usePayoutPolicy,
  useSetPayoutPolicy,
  useAdminRefundsDue,
  useAdminReplySupport,
  useAdminReports,
  useAdminProcessWithdrawal,
  useAdminResolveReport,
  useAdminReviewVerification,
  useAdminSetOrderStatus,
  useAdminSupport,
  useAdminVerifications,
  useAdminWithdrawals,
  useProfile,
  useResolveDispute,
  useRiskAlerts,
  useStaff,
  type FoundProfile,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira, parseNaira, shortId } from '../../lib/format'
import type { DisputeOutcome, PaymentIntent } from '../../lib/database.types'

const TABS = ['Disputes', 'Orders', 'Deliveries', 'Payouts', 'Verification', 'Reports', 'Support', 'Wallets', 'Users', 'Risk'] as const
type Tab = (typeof TABS)[number]
/** The staff area each tab belongs to; a role sees only its own tabs. */
const TAB_AREA: Record<Tab, StaffArea> = {
  Disputes: 'disputes', Orders: 'orders', Deliveries: 'logistics', Payouts: 'finance', Verification: 'verification',
  Reports: 'moderation', Support: 'support', Wallets: 'finance', Users: 'lookup', Risk: 'risk',
}

/**
 * The operator console: the human side of escrow. Everything here is also
 * enforced server-side (public.is_admin()), so this screen is a convenience,
 * not the security boundary.
 */
export function Admin() {
  const { data: profile, isLoading } = useProfile()
  const staff = useStaff()
  const tabs = TABS.filter((t) => staff.can(TAB_AREA[t]))
  const [chosen, setTab] = useState<Tab | null>(null)
  const tab = chosen && tabs.includes(chosen) ? chosen : tabs[0]
  const [error, setError] = useState<string | null>(null)

  const disputes = useAdminDisputes()
  const orders = useAdminOrders()
  const withdrawals = useAdminWithdrawals()
  const refunds = useAdminRefundsDue()
  const reports = useAdminReports()
  const support = useAdminSupport()
  const verifications = useAdminVerifications()
  const risk = useRiskAlerts()
  const sos = useAdminSos()
  const heldOrders = useAdminHeldPurchaseOrders()
  const businessVerifications = useAdminBusinessVerifications()
  const riders = useAdminRiders()
  const deliveries = useAdminDeliveries()

  if (isLoading) return <FullScreenLoader />
  if (!profile?.staff_role || !tab) return <Navigate to="/home" replace />

  const counts: Record<Tab, number> = {
    Disputes: (disputes.data?.length ?? 0) + (heldOrders.data?.length ?? 0),
    Orders: orders.data?.length ?? 0,
    Payouts: (withdrawals.data?.length ?? 0) + (refunds.data?.length ?? 0),
    Reports: reports.data?.length ?? 0,
    Support: support.data?.length ?? 0,
    Verification: (verifications.data?.length ?? 0) + (businessVerifications.data?.length ?? 0),
    Wallets: 0,
    Deliveries: (riders.data?.filter((r) => r.status === 'pending').length ?? 0) + (deliveries.data?.filter((d) => d.status === 'awaiting_rider').length ?? 0),
    Users: 0,
    Risk: (risk.data?.length ?? 0) + (sos.data?.length ?? 0),
  }

  return (
    <Screen>
      <PageHeader title="Operations" back="/home" />
      <div className="px-[22px] pb-10">
        {staff.can('analytics') && <Link to="/admin/analytics" className="block min-h-11 py-3 text-sm font-semibold text-brand underline">Platform reports & analytics</Link>}
        {staff.can('content') && <Link to="/admin/courses" className="block min-h-11 py-2 text-sm font-semibold text-brand underline">Courses and quizzes</Link>}
        {staff.can('finance') && <Link to="/admin/coupons" className="block min-h-11 py-2 text-sm font-semibold text-brand underline">FindWork coupons</Link>}
        <div className="flex gap-2 overflow-x-auto mt-3 -mx-[22px] px-[22px] pb-1">
          {tabs.map((t) => (
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
          {tab === 'Verification' && <VerificationTab onError={setError} />}
          {tab === 'Wallets' && <WalletsTab onError={setError} />}
          {tab === 'Deliveries' && <LogisticsTab onError={setError} />}
          {tab === 'Users' && <UsersTab onError={setError} />}
          {tab === 'Risk' && <RiskTab onError={setError} />}
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

/** Wholesale payments a buyer has put on hold: read both sides, then pay the supplier or refund the buyer. */
function HeldPurchaseOrders({ onError }: TabProps) {
  const { data } = useAdminHeldPurchaseOrders()
  const resolve = useAdminResolvePurchaseOrder()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!data?.length) return null
  return (
    <>
      <SectionLabel className="mb-2.5">Purchase orders on hold</SectionLabel>
      {data.map((po) => (
        <Panel key={po.id}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-[15.5px] text-ink">PO-{po.number} · {formatNaira(po.amount)}</span>
            <Badge tone="danger">On hold</Badge>
          </div>
          <div className="text-[13px] text-muted-2 mt-1">{po.buyer?.full_name}{po.organization ? ` (${po.organization.name})` : ''} vs {po.supplier?.full_name}</div>
          <p className="mt-2 text-[14px] leading-[1.45] text-text-soft">{po.title}: “{po.hold_reason}”</p>
          <input value={note[po.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [po.id]: e.target.value }))} placeholder="Decision note (both sides see it)"
            aria-label={`Decision note for PO-${po.number}`} className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2" />
          <div className="flex gap-2 mt-3">
            {(['release', 'refund'] as const).map((outcome) => (
              <button key={outcome} disabled={resolve.isPending} className={`flex-1 h-11 rounded-lg text-[14px] font-semibold disabled:opacity-50 ${outcome === 'release' ? 'bg-success text-white' : 'border border-line text-muted'}`} onClick={() => {
                if (!window.confirm(outcome === 'release' ? `Pay ${po.supplier?.full_name ?? 'the supplier'} ${formatNaira(po.amount)}?` : `Refund ${formatNaira(po.amount)} to the buyer?`)) return
                onError(null)
                resolve.mutate({ id: po.id, outcome, note: note[po.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
              }}>{outcome === 'release' ? 'Pay the supplier' : 'Refund the buyer'}</button>
            ))}
          </div>
        </Panel>
      ))}
    </>
  )
}

function DisputesTab({ onError }: TabProps) {
  const { data } = useAdminDisputes()
  const held = useAdminHeldPurchaseOrders()
  const resolve = useResolveDispute()
  const [note, setNote] = useState<Record<string, string>>({})

  if (!data?.length) return held.data?.length ? <HeldPurchaseOrders onError={onError} /> : <Empty text="No open disputes." />

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
      <HeldPurchaseOrders onError={onError} />
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
          <DisputeConversation disputeId={d.id} open={d.status === 'open'} />
          <CaseSummary disputeId={d.id} />
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
            {o.order_items.map((it) => `${it.qty}× ${it.name}${it.variant_name ? ` (${it.variant_name})` : ''}`).join(', ')}
          </div>
          <div className="text-[13px] text-muted-2 mt-1.5">
            {o.customer?.full_name} · {o.delivery_speed} · {formatDateTime(o.placed_at)}
          </div>
          {o.delivery_address && <div className="text-[13.5px] text-text-soft mt-1.5 whitespace-pre-line">{o.delivery_address}</div>}
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
  const { data: refunds } = useAdminRefundsDue()
  const process = useAdminProcessWithdrawal()
  const retry = useAdminRetryPayout()
  const requeue = useAdminRequeuePayout()
  const [note, setNote] = useState<Record<string, string>>({})
  const policy = <PayoutPolicyPanel onError={onError} />
  if (!data?.length && !refunds?.length) return <>{policy}<Empty text="No withdrawals or refunds waiting." /></>

  return (
    <>
      {policy}
      {refunds && refunds.length > 0 && <RefundsDue refunds={refunds} onError={onError} />}
      {refunds && refunds.length > 0 && data && data.length > 0 && (
        <SectionLabel className="mt-5 mb-2.5">Withdrawals</SectionLabel>
      )}
      {data?.map((w) => (
        <Panel key={w.id}>
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-[17px] text-ink">{formatNaira(w.amount)}</span>
            <span className="text-[12px] text-muted-2">{formatDateTime(w.created_at)}</span>
          </div>
          <div className="text-[14px] text-ink mt-2">{w.profile?.full_name}</div>
          <div className="text-[13.5px] text-text-soft mt-1">
            {w.bank_name} · {w.account_number} · {w.account_name}
          </div>
          {(w.transfer_status === 'queued' || w.transfer_status === 'sent') ? (
            <>
              <Alert tone="info" className="mt-3">
                Paystack is sending this{w.transfer_requested_at ? ` (asked ${formatDateTime(w.transfer_requested_at)})` : ''}. Reference {w.transfer_reference}.
              </Alert>
              {w.transfer_requested_at && Date.now() - new Date(w.transfer_requested_at).getTime() > 3_600_000 && (
                <div className="flex gap-2 mt-3">
                  <input value={note[w.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [w.id]: e.target.value }))}
                    placeholder="Why, after checking Paystack" className="flex-1 min-w-0 h-11 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2" />
                  <button className="h-11 px-3 border border-line rounded-lg text-[13.5px] font-semibold text-ink" disabled={requeue.isPending || (note[w.id] ?? '').trim().length < 3}
                    onClick={() => {
                      if (!window.confirm('Only do this once the Paystack dashboard shows the transfer did not go out. Take it back to settle by hand?')) return
                      onError(null)
                      requeue.mutate({ id: w.id, note: note[w.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
                    }}>Take back</button>
                </div>
              )}
            </>
          ) : (<>
          {w.transfer_status === 'failed' && (
            <div className="mt-3">
              <Alert>Automatic payout failed: {w.failure_reason ?? 'no reason given'}</Alert>
              <button className="min-h-11 text-[14px] font-semibold text-brand-hover" disabled={retry.isPending}
                onClick={() => { onError(null); retry.mutate(w.id, { onError: (e) => onError(friendlyError(e)) }) }}>Try Paystack again</button>
            </div>
          )}
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
          </>)}
        </Panel>
      ))}
    </>
  )
}

/** Whether withdrawals to bank-confirmed accounts go out through Paystack on their own, and up to how much. */
function PayoutPolicyPanel({ onError }: Pick<TabProps, 'onError'>) {
  const { data: policy } = usePayoutPolicy()
  const save = useSetPayoutPolicy()
  const [max, setMax] = useState<string | null>(null)
  if (!policy) return null
  const shownMax = max ?? String(policy.max)
  const parsedMax = Number(shownMax.replace(/\D/g, ''))
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <span className="font-display font-semibold text-[15.5px] text-ink">Automatic payouts</span>
        <Badge tone={policy.enabled && policy.configured ? 'success' : 'neutral'}>{policy.enabled && policy.configured ? 'On' : 'Off'}</Badge>
      </div>
      {!policy.configured ? (
        <p className="text-[13px] text-muted-2 mt-2">Not set up: deploy paystack-payout and add its rows to private.settings (see the README). Until then every withdrawal is sent by hand.</p>
      ) : (
        <>
          <p className="text-[13px] text-muted-2 mt-2">Withdrawals to accounts the bank confirmed are sent by Paystack Transfers up to this amount. Larger ones, and any from an account with an open high-risk alert, wait here.</p>
          <div className="flex gap-2 mt-3">
            <input value={shownMax} onChange={(e) => setMax(e.target.value)} inputMode="numeric" aria-label="Automatic payout limit in naira"
              className="flex-1 min-w-0 h-11 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none" />
            <button className="h-11 px-3 bg-ink text-cream rounded-lg text-[13.5px] font-semibold" disabled={save.isPending || parsedMax < 1000}
              onClick={() => { onError(null); save.mutate({ enabled: policy.enabled, max: parsedMax }, { onError: (e) => onError(friendlyError(e)) }) }}>Save limit</button>
          </div>
          <button className="min-h-11 mt-1 text-[14px] font-semibold text-brand-hover" disabled={save.isPending}
            onClick={() => { onError(null); save.mutate({ enabled: !policy.enabled, max: policy.max }, { onError: (e) => onError(friendlyError(e)) }) }}>
            {policy.enabled ? 'Turn automatic payouts off' : 'Turn automatic payouts on'}
          </button>
        </>
      )}
    </Panel>
  )
}

/** Paid into an account after it was deleted, so never credited. */
function RefundsDue({ refunds, onError }: TabProps & { refunds: PaymentIntent[] }) {
  const mark = useAdminMarkTopupRefunded()
  const [note, setNote] = useState<Record<string, string>>({})

  return (
    <>
      <SectionLabel className="mb-2.5">Top-ups to refund</SectionLabel>
      {refunds.map((p) => (
        <Panel key={p.id}>
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-[17px] text-ink">{formatNaira(p.amount)}</span>
            {p.paid_at && <span className="text-[12px] text-muted-2">{formatDateTime(p.paid_at)}</span>}
          </div>
          <div className="text-[13.5px] text-text-soft mt-1.5">
            Paid after the account was deleted. Refund it from the Paystack dashboard, then record it here.
          </div>
          <div className="font-mono text-[12px] text-ink mt-2 break-all">{p.reference}</div>
          <input
            value={note[p.id] ?? ''}
            onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
            placeholder="Paystack refund reference"
            className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2"
          />
          <button
            onClick={() => {
              onError(null)
              mark.mutate({ id: p.id, note: note[p.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}
            disabled={!note[p.id]?.trim() || mark.isPending}
            className="w-full h-11 mt-3 bg-success text-white rounded-lg text-[14px] font-semibold disabled:opacity-50"
          >
            Mark refunded
          </button>
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

const ID_TYPE_LABELS: Record<string, string> = {
  nin: 'NIN',
  bvn: 'BVN',
  passport: 'International passport',
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
}

/** IDs sent for checking: compare the photo, the selfie and the name. */
function BusinessVerifications({ onError }: TabProps) {
  const { data } = useAdminBusinessVerifications()
  const review = useAdminReviewBusinessVerification()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!data?.length) return null
  return (
    <>
      <SectionLabel className="mb-2.5">Businesses (CAC)</SectionLabel>
      {data.map((v) => (
        <Panel key={v.id}>
          <div className="font-display font-semibold text-[16px] text-ink">{v.business_name}</div>
          <div className="text-[14px] text-ink mt-1"><span className="font-mono">{v.rc_number}</span> · {v.profile?.full_name || 'Unnamed account'}</div>
          <PrivatePhoto bucket="verification-documents" path={v.document_path} label="CAC certificate" className="w-40 h-28 mt-3" />
          <RegisterChecks subjectType="business_verification" subjectId={v.id} onError={onError} />
          <input value={note[v.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [v.id]: e.target.value }))}
            placeholder="Reason, if rejecting (they will see it)" aria-label={`Reason for ${v.business_name}`}
            className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2" />
          <div className="flex gap-2 mt-3">
            <button disabled={review.isPending} className="flex-1 h-11 bg-success text-white rounded-lg text-[14px] font-semibold disabled:opacity-50" onClick={() => {
              if (!window.confirm(`Verify ${v.business_name} as a registered business?`)) return
              onError(null)
              review.mutate({ id: v.id, approve: true, note: note[v.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}>Approve</button>
            <button disabled={review.isPending || !(note[v.id] ?? '').trim()} className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted disabled:opacity-50" onClick={() => {
              onError(null)
              review.mutate({ id: v.id, approve: false, note: note[v.id] ?? '' }, { onError: (e) => onError(friendlyError(e)) })
            }}>Reject</button>
          </div>
        </Panel>
      ))}
    </>
  )
}

const CHECK_LABEL = { nin: 'NIN', bvn: 'BVN', cac: 'CAC', face: 'Face', sim: 'Phone (SIM)' } as const
const OUTCOME = {
  match: { label: 'Matches', tone: 'success' },
  mismatch: { label: 'Does not match', tone: 'danger' },
  not_found: { label: 'Not on the register', tone: 'danger' },
  error: { label: 'Could not check', tone: 'neutral' },
} as const

/** What the national register said, beside the documents; staff can ask again. */
function RegisterChecks({ subjectType, subjectId, onError }: TabProps & { subjectType: 'verification' | 'business_verification'; subjectId: string }) {
  const { data: checks } = useIdentityChecks(subjectType, subjectId)
  const run = useRunIdentityCheck()
  // The latest answer for each kind of check.
  const latest = Object.values(Object.fromEntries((checks ?? []).map((c) => [c.kind, c])))
  return (
    <div className="mt-3 bg-cream rounded-xl p-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-2 mb-1.5">National register</div>
      {latest.length === 0 ? <p className="text-[13px] text-muted-2">Not checked{subjectType === 'verification' ? ' (only a NIN or BVN can be)' : ''}.</p> : (
        <ul className="space-y-1.5">
          {latest.map((c) => {
            const detail = (c.detail ?? {}) as { registry_name?: string; message?: string; status?: string }
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink">
                <span className="font-semibold">{CHECK_LABEL[c.kind]}</span>
                <Badge tone={OUTCOME[c.outcome].tone}>{OUTCOME[c.outcome].label}{c.confidence !== null ? ` · ${c.confidence}%` : ''}</Badge>
                {detail.registry_name && <span className="text-muted-2">Register: {detail.registry_name}</span>}
                {detail.status && <span className="text-muted-2">{detail.status}</span>}
                {c.outcome === 'error' && detail.message && <span className="text-muted-2">{detail.message}</span>}
              </li>
            )
          })}
        </ul>
      )}
      <button className="min-h-11 text-[13.5px] font-semibold text-brand-hover" disabled={run.isPending} onClick={() => {
        onError(null)
        run.mutate(subjectType === 'verification' ? { verification_id: subjectId } : { business_verification_id: subjectId }, { onError: (e) => onError(friendlyError(e)) })
      }}>{run.isPending ? 'Checking…' : latest.length ? 'Check again' : 'Check with the register'}</button>
    </div>
  )
}

function VerificationTab({ onError }: TabProps) {
  const { data } = useAdminVerifications()
  const business = useAdminBusinessVerifications()
  const review = useAdminReviewVerification()
  const [note, setNote] = useState<Record<string, string>>({})
  if (!data?.length) return business.data?.length ? <BusinessVerifications onError={onError} /> : <Empty text="No IDs or businesses waiting to be checked." />

  function decide(id: string, name: string, approve: boolean) {
    const reason = note[id] ?? ''
    if (approve && !window.confirm(`Verify ${name}? They get access to every service.`)) return
    onError(null)
    review.mutate({ id, approve, note: reason }, { onError: (e) => onError(friendlyError(e)) })
  }

  return (
    <>
      <BusinessVerifications onError={onError} />
      {data.map((v) => {
        const name = v.profile?.full_name || 'Unnamed account'
        return (
          <Panel key={v.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-semibold text-[16px] text-ink truncate">{name}</span>
              <span className="text-[12px] text-muted-2">{formatDateTime(v.created_at)}</span>
            </div>
            <div className="text-[14px] text-ink mt-1.5">
              {ID_TYPE_LABELS[v.id_type] ?? v.id_type} · <span className="font-mono">{v.id_number}</span>
            </div>
            <div className="flex gap-3 mt-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-2 mb-1">ID</div>
                <PrivatePhoto bucket="verification-documents" path={v.document_path} label="ID photo" className="w-32 h-24" />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-2 mb-1">Selfie</div>
                <PrivatePhoto bucket="verification-documents" path={v.selfie_path} label="Selfie" className="w-24 h-24" />
              </div>
            </div>
            <RegisterChecks subjectType="verification" subjectId={v.id} onError={onError} />
            <input
              value={note[v.id] ?? ''}
              onChange={(e) => setNote((n) => ({ ...n, [v.id]: e.target.value }))}
              placeholder="Reason, if rejecting (they will see it)"
              className="w-full h-11 mt-3 bg-cream rounded-lg px-3 text-[14px] text-ink outline-none placeholder:text-muted-2"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => decide(v.id, name, true)}
                disabled={review.isPending}
                className="flex-1 h-11 bg-success text-white rounded-lg text-[14px] font-semibold disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => decide(v.id, name, false)}
                disabled={review.isPending || !(note[v.id] ?? '').trim()}
                className="flex-1 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </Panel>
        )
      })}
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

/**
 * An AI summary of a dispute: what happened, what the two sides agree and
 * differ on, and what to ask. It never recommends an outcome; the decision
 * is the member of staff's.
 */
function CaseSummary({ disputeId }: { disputeId: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'off' | 'error'; summary?: DisputeSummary; error?: string }>({ status: 'idle' })
  if (state.status === 'off') return null
  const s = state.summary
  const list = (title: string, items: string[]) => items.length > 0 && (
    <div className="mt-2"><div className="font-semibold text-ink">{title}</div><ul className="list-disc pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
  )
  return (
    <div className="mt-3 text-[13.5px] leading-[1.45] text-text-soft">
      {s ? (
        <div className="bg-cream rounded-xl p-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-2">AI summary · check it against the case · it does not decide</div>
          <p className="mt-1.5">{s.summary}</p>
          {list('Both sides accept', s.agreed)}
          {list('They differ on', s.contested)}
          {list('Not in the file', s.missing)}
          {list('Worth asking', s.questions)}
        </div>
      ) : (
        <button disabled={state.status === 'busy'} className="min-h-11 font-semibold text-brand" onClick={() => {
          setState({ status: 'busy' })
          askAssistant<DisputeSummary>('dispute', { dispute_id: disputeId }).then(
            (summary) => setState({ status: 'idle', summary }),
            (err) => setState(err instanceof AssistantUnavailable ? { status: 'off' } : { status: 'error', error: friendlyError(err) }),
          )
        }}>{state.status === 'busy' ? 'Reading the case…' : 'Summarise this case'}</button>
      )}
      {state.status === 'error' && <p className="text-danger">{state.error}</p>}
    </div>
  )
}
