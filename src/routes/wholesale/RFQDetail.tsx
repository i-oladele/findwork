import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const supplierNames = ['Balogun Fabrics', 'Lagos Textile Hub', 'Kano Wholesale Traders']

export function RFQDetail() {
  const { id } = useParams<{ id: string }>()
  const rfqs = useAppStore((s) => s.rfqs)
  const rfq = rfqs.find((r) => r.id === id)
  const [accepted, setAccepted] = useState<string | null>(null)

  if (!rfq) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-6 text-center text-sm text-muted">RFQ not found.</div>
      </Screen>
    )
  }

  const quotes = [0.86, 0.93, 0.98].map((factor, i) => ({
    supplier: supplierNames[i],
    price: Math.round(rfq.budgetMax * factor),
    leadTime: `${7 + i * 3} days`,
    verified: i < 2,
  }))

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/rfqs" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">{rfq.title}</span>
        </div>

        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="flex items-center gap-3">
            <span className="text-[13.5px] text-muted-3">Qty {rfq.quantity}</span>
            <span className="w-1 h-1 rounded-full bg-ink-line" />
            <span className="text-[13.5px] text-muted-3">by {rfq.deadline}</span>
          </div>
          <div className="font-display font-bold text-2xl text-cream mt-2">Up to {formatNaira(rfq.budgetMax)}</div>
          <p className="mt-2 text-[13.5px] leading-[1.5] text-muted-3">{rfq.description}</p>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">
          {quotes.length} supplier quotes
        </div>

        {accepted && (
          <div className="flex items-center gap-2.5 bg-success-bg rounded-xl px-3.5 py-3 mb-3">
            <i className="ph-fill ph-check-circle text-lg text-success-text" />
            <span className="text-[13.5px] text-success-text">Accepted {accepted}'s quote. They'll be in touch to confirm.</span>
          </div>
        )}

        {quotes.map((q, i) => (
          <div
            key={q.supplier}
            className={`bg-white rounded-2xl p-4 mb-3 ${i === 0 ? 'border-[1.5px] border-brand' : 'border border-line'}`}
          >
            <div className="flex gap-3.5">
              <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-[16px] text-ink">{q.supplier}</span>
                  <span className="font-display font-bold text-[17px] text-ink">{formatNaira(q.price)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {q.verified && <i className="ph-fill ph-shield-check text-sm text-success" />}
                  <span className="text-[12.5px] text-muted-2">Lead time {q.leadTime}</span>
                </div>
              </div>
            </div>
            {!accepted && (
              <button
                onClick={() => setAccepted(q.supplier)}
                className="flex items-center justify-center w-full h-11 mt-3.5 bg-brand text-white rounded-lg text-[14.5px] font-semibold"
              >
                Accept quote
              </button>
            )}
          </div>
        ))}
      </div>
    </Screen>
  )
}
