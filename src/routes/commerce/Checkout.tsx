import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { products, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const DELIVERY_FEE = { 'same-day': 1800, standard: 1200 } as const

export function Checkout() {
  const navigate = useNavigate()
  const cart = useAppStore((s) => s.cart)
  const balance = useAppStore((s) => s.wallet.balance)
  const placeOrder = useAppStore((s) => s.placeOrder)
  const [speed, setSpeed] = useState<'same-day' | 'standard'>('same-day')
  const [error, setError] = useState<string | null>(null)

  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0)
  const itemsTotal = cart.reduce((sum, l) => {
    const product = products.find((p) => p.id === l.productId)
    return sum + (product?.price ?? 0) * l.qty
  }, 0)
  const total = itemsTotal + DELIVERY_FEE[speed]

  function pay() {
    const orderId = placeOrder(speed)
    if (!orderId) {
      setError(cart.length === 0 ? 'Your cart is empty.' : 'Not enough balance in your wallet. Add money first.')
      return
    }
    navigate(`/track/${orderId}`)
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/cart" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Checkout</span>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[18px] mb-2.5">Deliver to</div>
        <div className="flex items-start gap-3 bg-white border-[1.5px] border-brand rounded-2xl p-4">
          <i className="ph-fill ph-map-pin text-[22px] text-brand" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">Adaeze Okoro · 0803 412 9087</div>
            <p className="mt-1 text-sm leading-[1.5] text-muted">14 Herbert Macaulay Way, Yaba, Lagos</p>
          </div>
          <span className="text-sm font-semibold text-brand-hover">Change</span>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Delivery speed</div>
        <button
          onClick={() => setSpeed('same-day')}
          className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left ${
            speed === 'same-day' ? 'border-[1.5px] border-brand' : 'border border-line'
          }`}
        >
          <i className="ph-fill ph-moped text-[22px] text-ink" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">Same-day rider</div>
            <div className="text-[13px] text-muted-2 mt-0.5">Today before 6pm</div>
          </div>
          <span className="font-display font-bold text-[15.5px] text-ink">₦1,800</span>
        </button>
        <button
          onClick={() => setSpeed('standard')}
          className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left mt-2.5 ${
            speed === 'standard' ? 'border-[1.5px] border-brand' : 'border border-line'
          }`}
        >
          <i className="ph ph-package text-[22px] text-ink" />
          <div className="flex-1">
            <div className="text-[15.5px] font-semibold text-ink">Standard</div>
            <div className="text-[13px] text-muted-2 mt-0.5">Tomorrow, 9am – 5pm</div>
          </div>
          <span className="font-display font-bold text-[15.5px] text-ink">₦1,200</span>
        </button>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Order summary</div>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="flex justify-between text-[15px] text-text-soft">
            <span>Items · {itemCount}</span><span className="text-ink">{formatNaira(itemsTotal)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
            <span>Delivery</span><span className="text-ink">{formatNaira(DELIVERY_FEE[speed])}</span>
          </div>
          <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t border-line-soft">
            <span className="font-display font-semibold text-[16px] text-ink">Total</span>
            <span className="font-display font-bold text-2xl text-ink">{formatNaira(total)}</span>
          </div>
        </div>
        <div className="text-[13px] text-muted-2 mt-2">Wallet balance {formatNaira(balance)}</div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        {error && (
          <div className="flex items-start gap-2.5 mb-3 bg-danger-bg rounded-lg px-3.5 py-2.5">
            <i className="ph-fill ph-warning-circle text-base text-danger relative top-0.5" />
            <p className="text-[13px] leading-[1.45] text-danger">{error}</p>
          </div>
        )}
        <Button onClick={pay}>Pay {formatNaira(total)} from wallet</Button>
      </div>
    </Screen>
  )
}
