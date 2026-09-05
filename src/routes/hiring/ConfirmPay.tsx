import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function ConfirmPay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const draft = useAppStore((s) => s.draftBooking)
  const balance = useAppStore((s) => s.wallet.balance)
  const payBooking = useAppStore((s) => s.payBooking)
  const [method, setMethod] = useState<'wallet' | 'card'>('wallet')
  const [error, setError] = useState<string | null>(null)

  if (!draft) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-1.5">
          <div className="flex items-center gap-1.5">
            <Link to={`/provider/${id}`} className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
              <i className="ph-bold ph-arrow-left text-[22px]" />
            </Link>
            <span className="font-display font-semibold text-[17px] text-ink">Review your booking</span>
          </div>
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center text-sm text-muted">
            No booking in progress — pick a time first.
          </div>
        </div>
      </Screen>
    )
  }

  const booking = draft
  const fee = Math.round(booking.price * 0.05)
  const total = booking.price + fee

  function submit() {
    if (method === 'card') {
      // Card/transfer is illustrative only — no real payment processor without a backend.
      setError('Card payments need a backend to process. Use the FindWork wallet for this demo.')
      return
    }
    const bookingId = payBooking()
    if (!bookingId) {
      setError('Not enough balance in your wallet. Add money first.')
      return
    }
    navigate(`/book/${booking.providerId}/confirmed`)
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to={`/book/${draft.providerId}/time`} className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Review your booking</span>
        </div>

        <div className="bg-white border border-line rounded-2xl p-[18px] mt-4">
          <div className="flex gap-3.5">
            <PlaceholderImage className="w-[54px] h-[54px] flex-none" />
            <div>
              <div className="font-display font-semibold text-[16.5px] text-ink">{draft.providerName}</div>
              <div className="text-[13.5px] text-muted mt-1">{draft.service}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-line-soft">
            <i className="ph ph-calendar-dots text-[19px] text-brand" />
            <span className="text-[15px] text-ink">{draft.date}, {draft.time}</span>
          </div>
          <div className="flex items-center gap-2.5 mt-2.5">
            <i className="ph ph-map-pin text-[19px] text-brand" />
            <span className="text-[15px] text-ink">14 Herbert Macaulay Way, Yaba</span>
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">What you pay</div>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="flex justify-between text-[15px] text-text-soft">
            <span>Service</span><span className="text-ink">{formatNaira(draft.price)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
            <span>Service fee</span><span className="text-ink">{formatNaira(fee)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
            <span>Escrow protection</span><span className="text-success-text font-semibold">Free</span>
          </div>
          <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t border-line-soft">
            <span className="font-display font-semibold text-[16px] text-ink">Total</span>
            <span className="font-display font-bold text-[22px] text-ink">{formatNaira(total)}</span>
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Pay with</div>
        <button
          onClick={() => setMethod('wallet')}
          className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left ${
            method === 'wallet' ? 'border-[1.5px] border-brand' : 'border border-line'
          }`}
        >
          <i className="ph-fill ph-wallet text-2xl text-success" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">FindWork wallet</div>
            <div className="text-[13px] text-muted-2 mt-0.5">Balance {formatNaira(balance)}</div>
          </div>
          {method === 'wallet' && <i className="ph-fill ph-check-circle text-[22px] text-brand" />}
        </button>
        <button
          onClick={() => setMethod('card')}
          className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left mt-2.5 ${
            method === 'card' ? 'border-[1.5px] border-brand' : 'border border-line'
          }`}
        >
          <i className="ph ph-credit-card text-2xl text-ink" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">Card or transfer</div>
            <div className="text-[13px] text-muted-2 mt-0.5">Verve, Mastercard, bank transfer</div>
          </div>
          {method === 'card' && <i className="ph-fill ph-check-circle text-[22px] text-brand" />}
        </button>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-6">
        {error && (
          <div className="flex items-start gap-2.5 mb-3 bg-danger-bg rounded-lg px-3.5 py-2.5">
            <i className="ph-fill ph-warning-circle text-base text-danger relative top-0.5" />
            <p className="text-[13px] leading-[1.45] text-danger">{error}</p>
          </div>
        )}
        <div className="flex items-start gap-2.5 mb-3">
          <i className="ph-fill ph-lock-simple text-base text-success relative top-0.5" />
          <p className="text-[13px] leading-[1.45] text-text-soft">
            {formatNaira(total)} is held in escrow. {draft.providerName.split(' ')[0]} is paid only when you mark the job done.
          </p>
        </div>
        <Button onClick={submit}>Pay {formatNaira(total)} into escrow</Button>
      </div>
    </Screen>
  )
}
