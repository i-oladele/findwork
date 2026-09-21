import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { FullScreenLoader } from '../../components/system/States'
import { DELIVERY_FEE, usePlaceOrder, useProducts, useProfile, useUpdateProfile, useWalletSummary } from '../../lib/api'
import { useCart } from '../../store/cart'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { toLocal } from '../../lib/phone'
import type { DeliverySpeed, Profile } from '../../lib/database.types'

export function Checkout() {
  const { data: profile, isLoading } = useProfile()
  const lines = useCart((s) => s.lines)

  if (lines.length === 0) return <Navigate to="/cart" replace />
  if (isLoading || !profile) return <FullScreenLoader />
  return <CheckoutForm profile={profile} />
}

function CheckoutForm({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  const lines = useCart((s) => s.lines)
  const clear = useCart((s) => s.clear)
  const { data: products } = useProducts()
  const { data: wallet } = useWalletSummary()
  const place = usePlaceOrder()
  const updateProfile = useUpdateProfile()

  const [speed, setSpeed] = useState<DeliverySpeed>('standard')
  const [address, setAddress] = useState(profile.address ?? '')
  const [phone, setPhone] = useState(profile.phone ? `0${toLocal(profile.phone)}` : '')
  const [error, setError] = useState<string | null>(null)

  const itemsTotal = lines.reduce((sum, l) => sum + (products?.find((p) => p.id === l.productId)?.price ?? 0) * l.qty, 0)
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0)
  const total = itemsTotal + DELIVERY_FEE[speed]
  const balance = wallet?.balance ?? 0
  const shortfall = Math.max(0, total - balance)
  const canPay = address.trim().length > 5 && shortfall === 0 && Boolean(products)

  async function pay() {
    setError(null)
    try {
      const orderIds = await place.mutateAsync({
        items: lines.map((l) => ({ product_id: l.productId, qty: l.qty })),
        deliverySpeed: speed,
        address: address.trim(),
        phone: phone.trim(),
      })
      // Remember the address for next time; a failure here must not undo the order.
      if (address.trim() !== (profile.address ?? '')) {
        updateProfile.mutate({ address: address.trim() })
      }
      clear()
      // A cart spanning two sellers becomes two orders; show the list instead
      // of picking one arbitrarily.
      navigate(orderIds.length === 1 ? `/order/${orderIds[0]}` : '/orders', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Checkout" back="/cart" />
      <div className="px-[22px] pb-6">
        <SectionLabel className="mt-[18px] mb-2.5">Deliver to</SectionLabel>
        <div className="bg-white border-[1.5px] border-line rounded-2xl p-4 space-y-3">
          <div className="text-[15.5px] font-semibold text-ink">{profile.full_name}</div>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="House number, street, area, and a landmark"
            aria-label="Delivery address"
            className="w-full bg-cream rounded-lg p-3 text-[15px] leading-[1.5] text-ink outline-none resize-none placeholder:text-muted-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="Phone number for the rider"
            aria-label="Phone number for the rider"
            className="w-full h-11 bg-cream rounded-lg px-3 text-[15px] text-ink outline-none placeholder:text-muted-2"
          />
        </div>

        <SectionLabel className="mt-5 mb-2.5">Delivery speed</SectionLabel>
        <SpeedOption
          active={speed === 'standard'}
          onClick={() => setSpeed('standard')}
          icon="ph ph-package"
          label="Standard"
          detail="Next working day"
          fee={DELIVERY_FEE.standard}
        />
        <SpeedOption
          active={speed === 'same-day'}
          onClick={() => setSpeed('same-day')}
          icon="ph-fill ph-moped"
          label="Same-day rider"
          detail="Order before 2pm"
          fee={DELIVERY_FEE['same-day']}
        />

        <SectionLabel className="mt-5 mb-2.5">Order summary</SectionLabel>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="flex justify-between text-[15px] text-text-soft">
            <span>Items · {itemCount}</span>
            <span className="text-ink">{formatNaira(itemsTotal)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
            <span>Delivery</span>
            <span className="text-ink">{formatNaira(DELIVERY_FEE[speed])}</span>
          </div>
          <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t border-line-soft">
            <span className="font-display font-semibold text-[16px] text-ink">Total</span>
            <span className="font-display font-bold text-2xl text-ink">{formatNaira(total)}</span>
          </div>
        </div>
        <div className="text-[13px] text-muted-2 mt-2">Wallet balance {formatNaira(balance)}</div>
        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        {shortfall > 0 ? (
          <Button to={`/wallet/add?amount=${shortfall}&return=/checkout`} className="w-full">
            Add {formatNaira(shortfall)} to your wallet
          </Button>
        ) : (
          <Button onClick={pay} disabled={!canPay} loading={place.isPending} className="w-full">
            {address.trim().length > 5 ? `Pay ${formatNaira(total)} from wallet` : 'Add a delivery address'}
          </Button>
        )}
      </div>
    </Screen>
  )
}

function SpeedOption({
  active,
  onClick,
  icon,
  label,
  detail,
  fee,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
  detail: string
  fee: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left mt-2.5 first:mt-0 ${
        active ? 'border-[1.5px] border-brand' : 'border border-line'
      }`}
    >
      <i className={`${icon} text-[22px] text-ink`} />
      <div className="flex-1">
        <div className="text-[15.5px] font-semibold text-ink">{label}</div>
        <div className="text-[13px] text-muted-2 mt-0.5">{detail}</div>
      </div>
      <span className="font-display font-bold text-[15.5px] text-ink">{formatNaira(fee)}</span>
    </button>
  )
}
