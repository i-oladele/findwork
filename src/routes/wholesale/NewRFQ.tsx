import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Chip } from '../../components/ui/Chip'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { useMyOrganizations, usePostBulkRfq } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'

type Line = { description: string; quantity: string; unit: string }

const TIERS: { tier: 0 | 2 | 3; label: string }[] = [
  { tier: 0, label: 'Any supplier' },
  { tier: 2, label: 'ID verified' },
  { tier: 3, label: 'Verified businesses' },
]

const field = 'w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2'

export function NewRFQ() {
  const navigate = useNavigate()
  const post = usePostBulkRfq()
  const orgs = useMyOrganizations()

  // A reorder from the stock records arrives as ?item=&qty=&unit=&org=.
  const [params] = useSearchParams()
  const reorder = params.get('item')
  const [organizationId, setOrganizationId] = useState<string | null>(params.get('org'))
  const [title, setTitle] = useState(reorder ? `Restock: ${reorder}` : '')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<Line[]>([{ description: reorder ?? '', quantity: params.get('qty') ?? '', unit: params.get('unit') ?? '' }])
  const [budgetMax, setBudgetMax] = useState('')
  const [deadline, setDeadline] = useState('')
  const [tier, setTier] = useState<0 | 2 | 3>(0)
  const [error, setError] = useState<string | null>(null)

  // A line left wholly empty is ignored; a half-filled one blocks posting.
  const filled = lines.filter((l) => l.description.trim() || l.quantity.trim())
  const linesValid = filled.every((l) => l.description.trim().length >= 2 && Number(l.quantity.replace(/\D/g, '')) > 0)
  const canSubmit = title.trim().length > 3 && linesValid && (description.trim().length > 0 || filled.length > 0)
  const update = (i: number, patch: Partial<Line>) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function submit() {
    setError(null)
    try {
      const id = await post.mutateAsync({
        organizationId,
        title: title.trim(),
        description: description.trim(),
        deadline: deadline.trim() || null,
        budgetMax: parseNaira(budgetMax) || null,
        minSupplierTier: tier,
        items: filled.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity.replace(/\D/g, '')), unit: l.unit.trim() || 'units' })),
      })
      navigate(`/rfqs/${id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Request a quotation" back="/rfqs" icon="x" />
      <div className="px-[22px] pb-6">
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Say what you need in bulk. Suppliers send a price for the whole order; the one you pick is paid through escrow when the goods arrive.
        </p>

        {(orgs.data?.length ?? 0) > 0 && (
          <>
            <SectionLabel className="mt-5 mb-2">Buying for</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Chip active={!organizationId} onClick={() => setOrganizationId(null)}>Myself</Chip>
              {orgs.data!.map((o) => <Chip key={o.id} active={organizationId === o.id} onClick={() => setOrganizationId(o.id)}>{o.name}</Chip>)}
            </div>
          </>
        )}

        <SectionLabel className="mt-5 mb-2">What you need</SectionLabel>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rice and oil for the canteen" maxLength={160} aria-label="Title" className={field} />

        <SectionLabel className="mt-4 mb-2">Lines of the order</SectionLabel>
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={line.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={200} placeholder="50kg bag of rice" aria-label={`Line ${i + 1} description`}
              className="flex-1 min-w-0 bg-white border-[1.5px] border-line rounded-lg h-12 px-3 text-[15px] text-ink outline-none placeholder:text-muted-2" />
            <input value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="numeric" placeholder="Qty" aria-label={`Line ${i + 1} quantity`}
              className="w-16 bg-white border-[1.5px] border-line rounded-lg h-12 px-3 text-[15px] text-ink outline-none placeholder:text-muted-2" />
            <input value={line.unit} onChange={(e) => update(i, { unit: e.target.value })} maxLength={20} placeholder="bags" aria-label={`Line ${i + 1} unit`}
              className="w-20 bg-white border-[1.5px] border-line rounded-lg h-12 px-3 text-[15px] text-ink outline-none placeholder:text-muted-2" />
            {lines.length > 1 && (
              <button type="button" aria-label={`Remove line ${i + 1}`} className="w-9 h-12 text-muted" onClick={() => setLines((all) => all.filter((_, j) => j !== i))}><i className="ph ph-x" /></button>
            )}
          </div>
        ))}
        {lines.length < 50 && (
          <button type="button" className="min-h-11 text-[14px] font-semibold text-brand" onClick={() => setLines((all) => [...all, { description: '', quantity: '', unit: '' }])}>Add another line</button>
        )}

        <SectionLabel className="mt-4 mb-2">Details</SectionLabel>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} aria-label="Details"
          placeholder="Quality, brands, sample first, delivery — anything a supplier needs to quote accurately"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2" />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <SectionLabel className="mb-2">Needed by</SectionLabel>
            <input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="10 Apr" aria-label="Needed by" className={field} />
          </div>
          <div className="flex-1">
            <SectionLabel className="mb-2">Budget ceiling</SectionLabel>
            <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
              <span>₦</span>
              <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} inputMode="numeric" placeholder="Optional" aria-label="Budget ceiling"
                className="flex-1 bg-transparent outline-none min-w-0 placeholder:text-muted-2 placeholder:font-normal" />
            </div>
          </div>
        </div>

        <SectionLabel className="mt-4 mb-2">Who may quote</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => <Chip key={t.tier} active={tier === t.tier} onClick={() => setTier(t.tier)}>{t.label}</Chip>)}
        </div>

        <Alert tone="info" className="mt-5">
          When you accept a quote, the price is taken from {organizationId ? "the organisation owner's" : 'your'} wallet and held in escrow. The supplier is paid when you confirm the goods arrived.
        </Alert>
        {error && <Alert className="mt-3">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        <Button onClick={submit} disabled={!canSubmit} loading={post.isPending} className="w-full">
          Post request
        </Button>
      </div>
    </Screen>
  )
}
