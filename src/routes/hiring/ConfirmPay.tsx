import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ListSkeleton } from '../../components/system/States'
import { platformFee, usePayBooking, useProvider, useProviderPackages, useWalletSummary } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatNaira } from '../../lib/format'

export function ConfirmPay() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const packageId = params.get('package')
  const at = params.get('at')

  const { data: provider } = useProvider(id)
  const { data: packages } = useProviderPackages(id)
  const { data: wallet } = useWalletSummary()
  const pay = usePayBooking()
  const [error, setError] = useState<string | null>(null)

  if (!at) {
    return (
      <Screen>
        <PageHeader title="Review your booking" back={`/book/${id}/time`} />
        <div className="px-[22px] pt-6">
          <Alert tone="info">Pick a day and time first.</Alert>
          <Button to={`/book/${id}/time`} className="mt-4 w-full">
            Choose a time
          </Button>
        </div>
      </Screen>
    )
  }

  const pkg = packages?.find((p) => p.id === packageId) ?? null
  const ready = provider && (packageId ? pkg : true)
  // Display only: pay_booking reads the real price from the package.
  const price = pkg?.price ?? provider?.price ?? 0
  const fee = platformFee(price)
  const total = price + fee
  const balance = wallet?.balance ?? 0
  const shortfall = Math.max(0, total - balance)

  async function submit() {
    setError(null)
    try {
      const bookingId = await pay.mutateAsync({ providerId: id!, packageId, startAt: at! })
      navigate(`/bookings/${bookingId}/confirmed`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Review your booking" back={`/book/${id}/time`} />
      <div className="px-[22px] pb-6">
        {!ready ? (
          <div className="pt-5">
            <ListSkeleton rows={3} />
          </div>
        ) : (
          <>
            <div className="bg-white border border-line rounded-2xl p-[18px] mt-4">
              <div className="flex gap-3.5">
                <PlaceholderImage src={provider.photo_urls[0]} className="w-[54px] h-[54px] flex-none" />
                <div className="min-w-0">
                  <div className="font-display font-semibold text-[16.5px] text-ink">{provider.business_name}</div>
                  <div className="text-[13.5px] text-muted mt-1">{pkg?.name ?? `${provider.category} service`}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-line-soft">
                <i className="ph ph-calendar-dots text-[19px] text-brand" />
                <span className="text-[15px] text-ink">{formatDateTime(at)}</span>
              </div>
              <div className="flex items-center gap-2.5 mt-2.5">
                <i className="ph ph-map-pin text-[19px] text-brand" />
                <span className="text-[14px] text-muted">Share the exact address in chat once they accept.</span>
              </div>
            </div>

            <SectionLabel className="mt-5 mb-2.5">What you pay</SectionLabel>
            <div className="bg-white border border-line rounded-2xl p-[18px]">
              <Row label="Service" value={formatNaira(price)} />
              <Row label="Service fee (5%)" value={formatNaira(fee)} />
              <div className="flex justify-between text-[15px] text-text-soft mt-2.5">
                <span>Escrow protection</span>
                <span className="text-success-text font-semibold">Free</span>
              </div>
              <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t border-line-soft">
                <span className="font-display font-semibold text-[16px] text-ink">Total</span>
                <span className="font-display font-bold text-[22px] text-ink">{formatNaira(total)}</span>
              </div>
            </div>

            <SectionLabel className="mt-5 mb-2.5">Pay with</SectionLabel>
            <div className="flex items-center gap-3.5 bg-white border-[1.5px] border-brand rounded-2xl p-4">
              <i className="ph-fill ph-wallet text-2xl text-success" />
              <div className="flex-1">
                <div className="text-[15.5px] font-semibold text-ink">FindWork wallet</div>
                <div className="text-[13px] text-muted-2 mt-0.5">Balance {formatNaira(balance)}</div>
              </div>
              {shortfall > 0 && (
                <Link
                  to={`/wallet/add?amount=${shortfall}&return=${encodeURIComponent(location.pathname + location.search)}`}
                  className="text-[14px] font-semibold text-brand-hover"
                >
                  Top up
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-6">
        {error && <Alert className="mb-3">{error}</Alert>}
        {shortfall > 0 && ready ? (
          <>
            <p className="text-[13px] leading-[1.45] text-text-soft mb-3">
              You need {formatNaira(shortfall)} more in your wallet for this booking.
            </p>
            <Button
              to={`/wallet/add?amount=${shortfall}&return=${encodeURIComponent(location.pathname + location.search)}`}
              className="w-full"
            >
              Add {formatNaira(shortfall)}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2.5 mb-3">
              <i className="ph-fill ph-lock-simple text-base text-success relative top-0.5" />
              <p className="text-[13px] leading-[1.45] text-text-soft">
                {formatNaira(total)} is held in escrow. The provider is paid only when you mark the job done. If
                they decline or you cancel before the start time, you get it all back.
              </p>
            </div>
            <Button onClick={submit} loading={pay.isPending} disabled={!ready} className="w-full">
              Pay {formatNaira(total)} into escrow
            </Button>
          </>
        )}
      </div>
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[15px] text-text-soft mt-2.5 first:mt-0">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}
