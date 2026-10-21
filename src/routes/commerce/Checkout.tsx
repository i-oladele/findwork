import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ErrorState, FullScreenLoader } from '../../components/system/States'
import { COUPON_ERRORS, DELIVERY_FEE, useAddresses, usePlaceOrder, useCheckoutQuote, useProfile, useStartPayment, useUpdateProfile, useWalletSummary } from '../../lib/api'
import { cartItems, useCart } from '../../store/cart'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { goToPaystack } from '../../lib/payRedirect'
import { DEFAULT_COUNTRY, formatPhone, fromInternational, isPhoneNumber, toE164 } from '../../lib/phone'
import type { DeliverySpeed, Profile, SavedAddress } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

export function Checkout() {
  const t = useT()
  const profile = useProfile()
  const addresses = useAddresses()
  const lines = useCart((s) => s.lines)

  if (lines.length === 0) return <Navigate to="/cart" replace />
  if (profile.isLoading || addresses.isLoading) return <FullScreenLoader />
  if (profile.isError || !profile.data) return <Screen><PageHeader title={t('Checkout')} back="/cart" /><ErrorState message="We could not load your profile." onRetry={() => void profile.refetch()} /></Screen>
  return <CheckoutForm profile={profile.data} initialAddresses={addresses.data ?? []} />
}

function CheckoutForm({ profile, initialAddresses }: { profile: Profile; initialAddresses: SavedAddress[] }) {
  const t = useT()
  const navigate = useNavigate()
  const lines = useCart((s) => s.lines)
  const clear = useCart((s) => s.clear)
  const { data: wallet, isFetching: walletLoading } = useWalletSummary()
  const place = usePlaceOrder()
  const startCard = useStartPayment()
  const updateProfile = useUpdateProfile()
  const addresses = useAddresses()
  const defaultAddress = initialAddresses.find((a) => a.is_default)

  const [speed, setSpeed] = useState<DeliverySpeed>('standard')
  // A pinned location is a good first guess at where to deliver.
  const [address, setAddress] = useState(defaultAddress?.address ?? profile.address ?? profile.location_label ?? '')
  const [phone, setPhone] = useState(formatPhone(defaultAddress?.phone ?? profile.phone ?? ''))
  const [recipient, setRecipient] = useState(defaultAddress?.recipient ?? profile.full_name)
  const [selectedAddress, setSelectedAddress] = useState(defaultAddress?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  // null until chosen: then the wallet when it covers the total, else the card.
  const [method, setMethod] = useState<'wallet' | 'card' | null>(null)

  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState('')
  const items = cartItems(lines)
  const quote = useCheckoutQuote(items, speed, coupon)
  // Only a settled, current quote is shown or paid: the server charges one
  // delivery fee per seller, which the cart cannot know on its own.
  const priced = quote.data && !quote.isFetching && !quote.isError ? quote.data : null
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0)
  const total = priced?.total ?? 0
  const balance = wallet?.balance ?? 0
  const shortfall = Math.max(0, total - balance)
  const walletReady = Boolean(wallet) && !walletLoading
  const deliveryPhone = fromInternational(phone) ?? { country: DEFAULT_COUNTRY, number: phone }
  const phoneValid = isPhoneNumber(deliveryPhone)
  const couponError = priced?.coupon?.error ? COUPON_ERRORS[priced.coupon.error] : null
  const payWith = method ?? (walletReady && shortfall === 0 ? 'wallet' : 'card')
  const detailsReady = recipient.trim().length > 0 && phoneValid && address.trim().length > 5 && priced !== null && !couponError
  const canPay = detailsReady && (payWith === 'card' || (shortfall === 0 && walletReady))
  const busy = place.isPending || startCard.isPending

  // The card pays the whole order. Paystack sends the customer back to the
  // payment result screen, which empties the cart once the order is placed.
  async function payByCard() {
    if (!canPay || !priced) return
    setError(null)
    try {
      const { reference, authorization_url } = await startCard.mutateAsync({
        purpose: 'checkout',
        items,
        delivery_speed: speed,
        address: `${recipient.trim()}\n${address.trim()}`,
        phone: toE164(deliveryPhone),
        coupon_code: coupon || null,
        expected_total: priced.total,
      })
      if (address.trim() !== (profile.address ?? '')) updateProfile.mutate({ address: address.trim() })
      goToPaystack(reference, authorization_url, '/orders')
    } catch (err) {
      setError(friendlyError(err))
      void quote.refetch()
    }
  }

  async function pay() {
    if (payWith === 'card') return payByCard()
    if (!canPay || !priced) return
    setError(null)
    try {
      const orderIds = await place.mutateAsync({
        items,
        deliverySpeed: speed,
        // Orders retain a delivery snapshot even if this address is edited later.
        address: `${recipient.trim()}\n${address.trim()}`,
        phone: toE164(deliveryPhone),
        expectedTotal: priced.total,
        ...(coupon ? { couponCode: coupon } : {}),
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
      void quote.refetch()
    }
  }

  return (
    <Screen>
      <PageHeader title={t('Checkout')} back="/cart" />
      <div className="px-[22px] pb-6">
        <SectionLabel className="mt-[18px] mb-2.5">{t('Deliver to')}</SectionLabel>
        <div className="bg-white border-[1.5px] border-line rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm"><span>{t('Saved addresses')}</span><Link to="/addresses" className="text-brand underline">{t('Manage')}</Link></div>
          {addresses.isError && <Alert>Saved addresses could not be loaded. You can enter one below. <button type="button" className="underline" onClick={() => void addresses.refetch()}>{t('Retry')}</button></Alert>}
          {!!addresses.data?.length && <select aria-label={t('Saved delivery address')} value={selectedAddress} className="w-full rounded-lg border border-line p-3 bg-white"
            onChange={(e) => {
              setSelectedAddress(e.target.value)
              const saved = addresses.data?.find((a) => a.id === e.target.value)
              if (saved) { setAddress(saved.address); setPhone(formatPhone(saved.phone)); setRecipient(saved.recipient) }
            }}>
            <option value="">{t('Enter an address')}</option>
            {addresses.data.map((a) => <option key={a.id} value={a.id}>{a.label}{a.is_default ? ' (default)' : ''}</option>)}
          </select>}
          <input aria-label={t('Recipient name')} value={recipient} maxLength={120} onChange={(e) => { setRecipient(e.target.value); setSelectedAddress('') }} className="w-full bg-cream rounded-lg p-3" />
          <textarea
            value={address}
            onChange={(e) => { setAddress(e.target.value); setSelectedAddress('') }}
            maxLength={500}
            rows={2}
            placeholder={t('House number, street, area, and a landmark')}
            aria-label={t('Delivery address')}
            className="w-full bg-cream rounded-lg p-3 text-[15px] leading-[1.5] text-ink outline-none resize-none placeholder:text-muted-2"
          />
          <input
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setSelectedAddress('') }}
            inputMode="tel"
            placeholder={t('Phone number for the rider')}
            aria-label={t('Phone number for the rider')}
            className="w-full h-11 bg-cream rounded-lg px-3 text-[15px] text-ink outline-none placeholder:text-muted-2"
          />
        </div>

        <SectionLabel className="mt-5 mb-2.5">{t('Delivery speed')}</SectionLabel>
        <SpeedOption
          active={speed === 'standard'}
          onClick={() => setSpeed('standard')}
          icon="ph ph-package"
          label={t('Standard')}
          detail="Next working day · fee per seller"
          fee={DELIVERY_FEE.standard}
        />
        <SpeedOption
          active={speed === 'same-day'}
          onClick={() => setSpeed('same-day')}
          icon="ph-fill ph-moped"
          label={t('Same-day rider')}
          detail="Order before 2pm · fee per seller"
          fee={DELIVERY_FEE['same-day']}
        />

        <SectionLabel className="mt-5 mb-2.5">{t('Coupon')}</SectionLabel>
        <form className="flex gap-2.5" onSubmit={(e) => { e.preventDefault(); setCoupon(couponInput.trim().toUpperCase()) }}>
          <input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} maxLength={20} autoCapitalize="characters" spellCheck={false}
            placeholder={t('Enter a code')} aria-label={t('Coupon code')}
            className="flex-1 min-w-0 bg-white border-[1.5px] border-line rounded-lg h-12 px-3.5 text-[15.5px] uppercase text-ink outline-none placeholder:normal-case placeholder:text-muted-2" />
          {coupon ? (
            <button type="button" className="px-4 h-12 border border-line rounded-lg text-[14.5px] font-semibold text-muted" onClick={() => { setCoupon(''); setCouponInput('') }}>{t('Remove')}</button>
          ) : (
            <button type="submit" disabled={couponInput.trim().length < 4} className="px-4 h-12 bg-ink text-cream rounded-lg text-[14.5px] font-semibold disabled:opacity-50">{t('Apply')}</button>
          )}
        </form>
        {couponError && <Alert className="mt-3">{couponError} Remove it to continue.</Alert>}
        {priced?.coupon && !priced.coupon.error && (
          <Alert tone="success" className="mt-3">{priced.coupon.code} from {priced.coupon.issuer ?? 'the seller'}: {formatNaira(priced.discount)} off.</Alert>
        )}

        <SectionLabel className="mt-5 mb-2.5">{t('Order summary')}</SectionLabel>
        <div className="bg-white border border-line rounded-2xl p-[18px]">
          <div className="flex justify-between text-[15px] text-text-soft">
            <span>Items · {itemCount}</span>
            <span className="text-ink">{priced ? formatNaira(priced.items_total) : '…'}</span>
          </div>
          {priced && priced.discount > 0 && (
            <div className="flex justify-between text-[15px] text-success-text mt-2.5">
              <span>Coupon {priced.coupon?.code}</span>
              <span>−{formatNaira(priced.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
            <span>
              Delivery{priced && ` · ${priced.seller_count} shipment${priced.seller_count === 1 ? '' : 's'}`}
            </span>
            <span className="text-ink">{priced ? formatNaira(priced.delivery_fee) : '…'}</span>
          </div>
          <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t border-line-soft">
            <span className="font-display font-semibold text-[16px] text-ink">{t('Total')}</span>
            <span className="font-display font-bold text-2xl text-ink">{priced ? formatNaira(total) : '…'}</span>
          </div>
        </div>

        <SectionLabel className="mt-5 mb-2.5">{t('Pay with')}</SectionLabel>
        <MethodOption active={payWith === 'wallet'} onClick={() => setMethod('wallet')} icon="ph-fill ph-wallet" label={t('Wallet')}
          detail={`Balance ${formatNaira(balance)}${priced && shortfall > 0 ? ` · ${formatNaira(shortfall)} short` : ''}`} />
        <MethodOption active={payWith === 'card'} onClick={() => setMethod('card')} icon="ph-fill ph-credit-card" label={t('Card or bank transfer')}
          detail="Paid securely through Paystack" />
        {quote.isError && (
          <Alert className="mt-4">
            {friendlyError(quote.error)}{' '}
            <button type="button" className="underline" onClick={() => void quote.refetch()}>
              {t('Retry')}
            </button>
          </Alert>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        {payWith === 'wallet' && priced && walletReady && shortfall > 0 ? (
          <Button to={`/wallet/add?amount=${shortfall}&return=/checkout`} className="w-full">
            Add {formatNaira(shortfall)} to your wallet
          </Button>
        ) : (
          <Button onClick={pay} disabled={!canPay || busy} loading={busy} className="w-full">
            {!priced
              ? quote.isError ? 'Total unavailable' : 'Checking total…'
              : !recipient.trim() ? 'Add a recipient name'
                : address.trim().length <= 5 ? 'Add a delivery address'
                  : !phoneValid ? 'Add a valid phone number'
                    : payWith === 'card' ? `Pay ${formatNaira(total)} by card` : `Pay ${formatNaira(total)} from wallet`}
          </Button>
        )}
      </div>
    </Screen>
  )
}

function MethodOption({ active, onClick, icon, label, detail }: { active: boolean; onClick: () => void; icon: string; label: string; detail: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left mt-2.5 first:mt-0 ${active ? 'border-[1.5px] border-brand' : 'border border-line'}`}>
      <i className={`${icon} text-[22px] text-ink`} />
      <div className="flex-1">
        <div className="text-[15.5px] font-semibold text-ink">{label}</div>
        <div className="text-[13px] text-muted-2 mt-0.5">{detail}</div>
      </div>
      <i className={`ph${active ? '-fill ph-check-circle text-brand' : ' ph-circle text-muted-2'} text-[20px]`} />
    </button>
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
