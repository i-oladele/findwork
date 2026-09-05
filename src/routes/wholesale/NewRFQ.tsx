import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/appStore'

export function NewRFQ() {
  const navigate = useNavigate()
  const postRFQ = useAppStore((s) => s.postRFQ)

  const [title, setTitle] = useState('Ankara wax print, bulk order')
  const [description, setDescription] = useState('Need consistent fabric quality for a batch of uniforms. Sample first, then bulk supply.')
  const [quantity, setQuantity] = useState('200 yards')
  const [budgetMax, setBudgetMax] = useState('280,000')
  const [deadline, setDeadline] = useState('10 Apr')

  const canSubmit = title.trim().length > 0 && Number(budgetMax.replace(/,/g, '')) > 0

  function submit() {
    const id = postRFQ({
      title,
      description,
      quantity,
      budgetMax: Number(budgetMax.replace(/,/g, '')) || 0,
      deadline,
    })
    navigate(`/rfqs/${id}`)
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/rfqs" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-x text-xl" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Request a quotation</span>
        </div>
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Describe what you need. Verified suppliers will send you bulk pricing.
        </p>

        <div className="mt-5">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">What you need</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Details</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none"
          />
        </div>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Quantity</div>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
            />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Needed by</div>
            <input
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Budget ceiling</div>
          <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
            <span>₦</span>
            <input
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              inputMode="numeric"
              className="flex-1 bg-transparent outline-none min-w-0"
            />
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-white border border-line rounded-2xl p-4 mt-5">
          <i className="ph-fill ph-sparkle text-[19px] text-success relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-text-soft">
            We will send this to verified suppliers who match your category and budget.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <Button onClick={submit} disabled={!canSubmit}>Send RFQ to suppliers</Button>
      </div>
    </Screen>
  )
}
