import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TrustBadge } from '../../components/ui/TrustBadge'
import { QueryState } from '../../components/system/QueryState'
import {
  PO_STATUS,
  findTransferRecipient,
  useCreateOrganization,
  useMyOrganizations,
  useOrganizationMembers,
  useProcurementSummary,
  usePurchaseOrders,
  useSetOrganizationMember,
  useSetOrganizationSupplier,
  useUpdateOrganization,
  type MyOrganization,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDate, formatNaira, parseNaira } from '../../lib/format'

/**
 * Buying in bulk, for yourself or for an organisation: what has been spent
 * and with whom, what is waiting for approval or delivery, and the orders
 * other buyers have placed with you.
 */
export function Procurement() {
  const orgs = useMyOrganizations()
  const [chosen, setChosen] = useState<string | null>(null)
  const [mode, setMode] = useState<'buying' | 'supplying'>('buying')
  const [creating, setCreating] = useState(false)
  const org = orgs.data?.find((o) => o.id === chosen) ?? null

  return (
    <Screen>
      <PageHeader title="Procurement" back="/home" right={<Link to="/rfqs/new" className="text-[14.5px] font-semibold text-brand-hover">New request</Link>} />
      <div className="px-[22px] pb-10">
        <div className="flex gap-2 mt-4">
          <Chip active={mode === 'buying'} onClick={() => setMode('buying')}>Buying</Chip>
          <Chip active={mode === 'supplying'} onClick={() => setMode('supplying')}>Supplying</Chip>
        </div>

        {mode === 'buying' && (
          <>
            <div className="flex gap-2 overflow-x-auto mt-3 -mx-[22px] px-[22px] pb-1">
              <Chip active={!org} onClick={() => setChosen(null)}>Myself</Chip>
              {orgs.data?.map((o) => <Chip key={o.id} active={org?.id === o.id} onClick={() => setChosen(o.id)}>{o.name}</Chip>)}
              <Chip icon="plus" onClick={() => setCreating(true)}>Organisation</Chip>
            </div>
            {creating && <CreateOrganization onClose={() => setCreating(false)} onCreated={setChosen} />}
            <Summary organizationId={org?.id ?? null} canManageSuppliers={org ? org.role !== 'buyer' : false} />
          </>
        )}

        <SectionLabel className="mt-6 mb-2.5">{mode === 'buying' ? 'Purchase orders' : 'Orders from buyers'}</SectionLabel>
        <Orders scope={mode} organizationId={mode === 'buying' ? org?.id ?? null : null} />

        {mode === 'buying' && org && <Team org={org} />}
        <Link to="/rfqs" className="inline-block min-h-11 pt-4 text-[14.5px] font-semibold text-brand-hover">Requests for quotation</Link>
      </div>
    </Screen>
  )
}

function CreateOrganization({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateOrganization()
  const [name, setName] = useState('')
  const [threshold, setThreshold] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="mt-3 bg-white border border-line rounded-2xl p-4 space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      setError(null)
      try { onCreated(await create.mutateAsync({ name: name.trim(), approvalThreshold: parseNaira(threshold) })); onClose() }
      catch (err) { setError(friendlyError(err)) }
    }}>
      <Input label="Organisation name" value={name} onChange={setName} autoCapitalize="words" />
      <Input label="Buyers may spend without approval up to (₦)" value={threshold} onChange={setThreshold} type="tel" placeholder="0"
        hint="Anything above this waits for you or an approver. Purchases are paid from your wallet." />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={name.trim().length < 2} loading={create.isPending}>Create organisation</Button>
      <button type="button" className="block w-full min-h-11 text-[14.5px] text-muted" onClick={onClose}>Cancel</button>
    </form>
  )
}

function Summary({ organizationId, canManageSuppliers }: { organizationId: string | null; canManageSuppliers: boolean }) {
  const summary = useProcurementSummary(organizationId)
  const setSupplier = useSetOrganizationSupplier()
  const [error, setError] = useState<string | null>(null)
  return (
    <QueryState query={summary} errorMessage="We could not load the summary." skeletonRows={2}>
      {(s) => {
        const peak = Math.max(1, ...s.months.map((m) => m.spent))
        return (
          <>
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <Tile label="Paid to suppliers" value={formatNaira(s.spent)} />
              <Tile label="Held in escrow" value={formatNaira(s.in_escrow)} />
              <Tile label="Awaiting approval" value={String(s.awaiting_approval)} />
              <Tile label="Open orders" value={String(s.open)} />
            </div>

            {s.months.length > 0 && (
              <>
                <SectionLabel className="mt-6 mb-2.5">Spend by month</SectionLabel>
                <div className="bg-white border border-line rounded-2xl p-4 space-y-2">
                  {s.months.map((m) => (
                    <div key={m.month} className="flex items-center gap-3 text-[13.5px]">
                      <span className="w-16 text-muted-2">{m.month}</span>
                      <span className="flex-1 h-2 rounded-full bg-line-soft overflow-hidden"><span className="block h-full bg-brand" style={{ width: `${(m.spent / peak) * 100}%` }} /></span>
                      <span className="w-24 text-right text-ink">{formatNaira(m.spent)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {s.suppliers.length > 0 && (
              <>
                <SectionLabel className="mt-6 mb-2.5">Suppliers</SectionLabel>
                {error && <Alert className="mb-3">{error}</Alert>}
                {s.suppliers.map((sup) => (
                  <div key={sup.supplier_id} className="bg-white border border-line rounded-2xl p-4 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-[15.5px] text-ink truncate">{sup.name || 'Supplier'}</span>
                      {sup.status === 'approved' && <Badge tone="success" icon="check-circle">Approved</Badge>}
                      {sup.status === 'blocked' && <Badge tone="danger" icon="prohibit">Blocked</Badge>}
                    </div>
                    <div className="mt-1.5"><TrustBadge tier={sup.tier} score={sup.trust} /></div>
                    <div className="text-[13px] text-muted-2 mt-1.5">{sup.orders} order{sup.orders === 1 ? '' : 's'} · {formatNaira(sup.spent)} paid</div>
                    {organizationId && canManageSuppliers && (
                      <div className="flex gap-5 mt-1 text-[14px] font-semibold">
                        {sup.status !== 'approved' && <button disabled={setSupplier.isPending} className="min-h-11 text-success-text" onClick={() => { setError(null); setSupplier.mutate({ organizationId, supplierId: sup.supplier_id, status: 'approved' }, { onError: (e) => setError(friendlyError(e)) }) }}>Approve</button>}
                        {sup.status !== 'blocked' && <button disabled={setSupplier.isPending} className="min-h-11 text-danger" onClick={() => { if (!window.confirm(`Stop buying from ${sup.name}? They will not be able to quote on this organisation's requests.`)) return; setError(null); setSupplier.mutate({ organizationId, supplierId: sup.supplier_id, status: 'blocked' }, { onError: (e) => setError(friendlyError(e)) }) }}>Block</button>}
                        {sup.status && <button disabled={setSupplier.isPending} className="min-h-11 text-muted" onClick={() => { setError(null); setSupplier.mutate({ organizationId, supplierId: sup.supplier_id, status: null }, { onError: (e) => setError(friendlyError(e)) }) }}>Clear</button>}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )
      }}
    </QueryState>
  )
}

function Orders({ scope, organizationId }: { scope: 'buying' | 'supplying'; organizationId: string | null }) {
  const orders = usePurchaseOrders(scope, organizationId)
  return (
    <QueryState query={orders} errorMessage="We could not load purchase orders."
      empty={{ icon: 'ph-file-text', title: 'No purchase orders yet', body: scope === 'buying' ? 'Accept a quote on one of your requests to raise one.' : 'Quote on open requests to win orders.' }}>
      {(rows) => rows.map((po) => (
        <Link key={po.id} to={`/purchase-orders/${po.id}`} className="block bg-white border border-line rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">PO-{po.number} · {formatDate(po.created_at)}</span>
            <Badge tone={PO_STATUS[po.status].tone}>{PO_STATUS[po.status].label}</Badge>
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-2">
            <span className="font-display font-semibold text-[15.5px] text-ink truncate">{po.title}</span>
            <span className="font-display font-bold text-[16px] text-ink">{formatNaira(po.amount)}</span>
          </div>
          <div className="text-[13px] text-muted-2 mt-1">
            {scope === 'buying' ? `From ${po.supplier?.full_name || 'supplier'}` : `For ${po.organization?.name ?? po.buyer?.full_name ?? 'buyer'}`}
          </div>
        </Link>
      ))}
    </QueryState>
  )
}

function Team({ org }: { org: MyOrganization }) {
  const members = useOrganizationMembers(org.id)
  const setMember = useSetOrganizationMember()
  const update = useUpdateOrganization()
  const [contact, setContact] = useState('')
  const [role, setRole] = useState<'buyer' | 'approver'>('buyer')
  const [threshold, setThreshold] = useState(String(org.approval_threshold))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const owner = org.role === 'owner'

  async function add() {
    setError(null)
    setBusy(true)
    try {
      const found = await findTransferRecipient(contact)
      if (!found) throw new Error('Nobody on FindWork has that phone number or email.')
      await setMember.mutateAsync({ organizationId: org.id, profileId: found.id, role })
      setContact('')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <SectionLabel className="mt-6 mb-2.5">{org.name} · team</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4">
        {members.data?.map((m) => (
          <div key={m.profile_id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[15px] text-ink truncate">{m.profile?.full_name || 'Member'}</span>
            <span className="flex items-center gap-3">
              <Badge tone={m.role === 'buyer' ? 'neutral' : 'success'}>{m.role}</Badge>
              {owner && m.role !== 'owner' && (
                <button disabled={setMember.isPending} className="min-h-11 text-[13.5px] font-semibold text-muted" onClick={() => { setError(null); setMember.mutate({ organizationId: org.id, profileId: m.profile_id, role: null }, { onError: (e) => setError(friendlyError(e)) }) }}>Remove</button>
              )}
            </span>
          </div>
        ))}
        {owner && (
          <div className="border-t border-line-soft mt-3 pt-3 space-y-3">
            <Input label="Add a member by phone or email" value={contact} onChange={setContact} autoCapitalize="none" />
            <div className="flex gap-2">
              <Chip active={role === 'buyer'} onClick={() => setRole('buyer')}>Buyer</Chip>
              <Chip active={role === 'approver'} onClick={() => setRole('approver')}>Approver</Chip>
            </div>
            <Button variant="secondary" className="h-12 text-ink" disabled={contact.trim().length < 6} loading={busy} onClick={add}>Add to {org.name}</Button>
            <Input label="Buyers may spend without approval up to (₦)" value={threshold} onChange={setThreshold} type="tel" />
            <button disabled={update.isPending} className="min-h-11 text-[14px] font-semibold text-brand" onClick={() => { setError(null); update.mutate({ id: org.id, name: org.name, approvalThreshold: parseNaira(threshold) }, { onError: (e) => setError(friendlyError(e)) }) }}>Save approval limit</button>
          </div>
        )}
        {error && <Alert className="mt-3">{error}</Alert>}
        <p className="text-[12.5px] leading-[1.45] text-muted-2 mt-3">Buyers post requests and choose quotes. Approvers and the owner approve purchases above the limit, confirm deliveries and manage suppliers. Purchases are paid from the owner's wallet.</p>
      </div>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-line rounded-xl p-3">
      <div className="text-[11.5px] text-muted-2">{label}</div>
      <div className="font-display font-bold text-[18px] text-ink mt-0.5 break-words">{value}</div>
    </div>
  )
}
