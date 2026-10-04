import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useCoupons, useSaveCoupon, useStaff } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDate, formatNaira, parseNaira } from '../../lib/format'
import type { Coupon } from '../../lib/database.types'

/** A seller's discount codes. The seller funds them: the discount comes out of what they are paid. */
export function Coupons() {
  return <RequireProvider>{() => <CouponManager platform={false} />}</RequireProvider>
}

/** FindWork's own codes, for its own catalog. Finance staff only. */
export function PlatformCoupons() {
  const staff = useStaff()
  if (!staff.can('finance')) return <Navigate to="/home" replace />
  return <CouponManager platform />
}

function describe(c: Coupon) {
  const off = c.kind === 'percent' ? `${c.value}% off` : `${formatNaira(c.value)} off`
  const parts = [off]
  if (c.max_discount) parts.push(`up to ${formatNaira(c.max_discount)}`)
  if (c.min_spend > 0) parts.push(`on ${formatNaira(c.min_spend)} or more`)
  return parts.join(' ')
}

function CouponManager({ platform }: { platform: boolean }) {
  const coupons = useCoupons(platform)
  const save = useSaveCoupon()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Screen>
      <PageHeader title={platform ? 'FindWork coupons' : 'Coupons'} back={platform ? '/admin' : '/provider'} />
      <div className="px-[22px] pb-10">
        <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">
          {platform
            ? 'Codes for goods sold by FindWork itself. The discount reduces what FindWork collects.'
            : 'Give customers a code for money off your products. The discount comes out of what you are paid, and commission is charged on the discounted amount.'}
        </p>
        {error && <Alert className="mt-4">{error}</Alert>}
        {adding ? <CouponForm platform={platform} onClose={() => setAdding(false)} /> : <Button className="mt-4" icon="plus" onClick={() => setAdding(true)}>New coupon</Button>}
        <div className="mt-5">
          <QueryState query={coupons} errorMessage="We could not load your coupons." empty={{ icon: 'ph-ticket', title: 'No coupons yet' }}>
            {(rows) => rows.map((c) => {
              const ended = Boolean(c.ends_at && new Date(c.ends_at).getTime() <= Date.now())
              const usedUp = c.usage_limit !== null && c.used_count >= c.usage_limit
              return (
                <div key={c.id} className="bg-white border border-line rounded-2xl p-4 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[16px] tracking-[0.06em] text-ink">{c.code}</span>
                    {!c.active ? <Badge tone="neutral">Off</Badge> : ended ? <Badge tone="neutral">Ended</Badge> : usedUp ? <Badge tone="neutral">Used up</Badge> : <Badge tone="success">Live</Badge>}
                  </div>
                  <div className="text-[14.5px] text-ink mt-1.5">{describe(c)}</div>
                  <div className="text-[12.5px] text-muted-2 mt-1">
                    Used {c.used_count}{c.usage_limit ? ` of ${c.usage_limit}` : ''} time{c.used_count === 1 && !c.usage_limit ? '' : 's'} · {c.per_customer_limit} per customer
                    {c.ends_at ? ` · ends ${formatDate(c.ends_at)}` : ''}
                  </div>
                  <button disabled={save.isPending} className="mt-2 min-h-11 text-[14px] font-semibold text-brand" onClick={() => {
                    setError(null)
                    save.mutate({
                      id: c.id, code: c.code, kind: c.kind, value: c.value, minSpend: c.min_spend, maxDiscount: c.max_discount,
                      endsAt: ended ? null : c.ends_at, usageLimit: c.usage_limit, perCustomer: c.per_customer_limit, active: !c.active, platform,
                    }, { onError: (e) => setError(friendlyError(e)) })
                  }}>{c.active ? 'Turn off' : 'Turn on'}</button>
                </div>
              )
            })}
          </QueryState>
        </div>
      </div>
    </Screen>
  )
}

function CouponForm({ platform, onClose }: { platform: boolean; onClose: () => void }) {
  const save = useSaveCoupon()
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [minSpend, setMinSpend] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cleaned = code.replace(/\s/g, '').toUpperCase()
  const amount = kind === 'percent' ? Number(value.replace(/\D/g, '')) : parseNaira(value)
  const valid = /^[A-Z0-9]{4,20}$/.test(cleaned) && amount > 0 && (kind === 'fixed' || amount <= 90)

  return (
    <form className="mt-4 bg-white border border-line rounded-2xl p-4 space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      if (!valid || save.isPending) return
      setError(null)
      try {
        await save.mutateAsync({
          code: cleaned, kind, value: amount, minSpend: parseNaira(minSpend), maxDiscount: kind === 'percent' && parseNaira(maxDiscount) > 0 ? parseNaira(maxDiscount) : null,
          // The last moment of the chosen day, Lagos time.
          endsAt: endsOn ? new Date(`${endsOn}T23:59:59+01:00`).toISOString() : null,
          usageLimit: Number(usageLimit.replace(/\D/g, '')) || null, perCustomer: 1, active: true, platform,
        })
        onClose()
      } catch (err) { setError(friendlyError(err)) }
    }}>
      <Input label="Code customers type" value={code} onChange={setCode} placeholder="WELCOME10" autoCapitalize="none" hint="4 to 20 letters and numbers. It cannot be changed later." />
      <div className="flex gap-2.5">
        <Chip active={kind === 'percent'} onClick={() => setKind('percent')}>Percentage off</Chip>
        <Chip active={kind === 'fixed'} onClick={() => setKind('fixed')}>Amount off</Chip>
      </div>
      <Input label={kind === 'percent' ? 'Percent off (1 to 90)' : 'Amount off (₦)'} value={value} onChange={setValue} type="tel" placeholder={kind === 'percent' ? '10' : '1000'} />
      {kind === 'percent' && <Input label="Most it can take off (₦, optional)" value={maxDiscount} onChange={setMaxDiscount} type="tel" />}
      <Input label="Minimum spend (₦, optional)" value={minSpend} onChange={setMinSpend} type="tel" />
      <Input label="Total uses allowed (optional)" value={usageLimit} onChange={setUsageLimit} type="tel" hint="Each customer can use a code once." />
      <label className="block text-[14px] text-text-soft">Last day (optional)
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="block w-full mt-1 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-ink" />
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={!valid} loading={save.isPending}>Create coupon</Button>
      <button type="button" className="block w-full min-h-11 text-[14.5px] text-muted" onClick={onClose}>Cancel</button>
    </form>
  )
}
