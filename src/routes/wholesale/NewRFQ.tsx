import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { usePostRfq } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'

export function NewRFQ() {
  const navigate = useNavigate()
  const post = usePostRfq()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 3 && description.trim().length > 0

  async function submit() {
    setError(null)
    try {
      const id = await post.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        quantity: quantity.trim() || undefined,
        budget_max: parseNaira(budgetMax) || undefined,
        deadline: deadline.trim() || undefined,
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
          Describe what you need in bulk. Suppliers on FindWork send you pricing, and you deal with the one you pick.
        </p>

        <SectionLabel className="mt-5 mb-2">What you need</SectionLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ankara wax print, bulk order"
          maxLength={120}
          className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-4 mb-2">Details</SectionLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Quality, colours, sample first, delivery — anything a supplier needs to quote accurately"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
        />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <SectionLabel className="mb-2">Quantity</SectionLabel>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="200 yards"
              className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
            />
          </div>
          <div className="flex-1">
            <SectionLabel className="mb-2">Needed by</SectionLabel>
            <input
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="10 Apr"
              className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
            />
          </div>
        </div>

        <SectionLabel className="mt-4 mb-2">Budget ceiling (optional)</SectionLabel>
        <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
          <span>₦</span>
          <input
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            inputMode="numeric"
            placeholder="280,000"
            className="flex-1 bg-transparent outline-none min-w-0 placeholder:text-muted-2 placeholder:font-normal"
          />
        </div>

        <Alert tone="info" className="mt-5">
          Bulk deals are arranged between you and the supplier. FindWork escrow covers bookings and shop orders,
          not these.
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
