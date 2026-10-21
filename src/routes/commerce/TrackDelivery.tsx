import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TrackMap, type MapMarker } from '../../components/ui/TrackMap'
import { QueryState } from '../../components/system/QueryState'
import { requestRoutedEta, useDeliveryTracking, useSetDeliveryDropoff, type Tracking } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatTime, shortId } from '../../lib/format'
import { describeEta } from '../../lib/routing'
import { msg, useT } from '../../lib/i18n'

const VEHICLE = { bicycle: 'Bicycle', motorcycle: 'Motorcycle', car: 'Car', van: 'Van' } as const // i18n

const STEPS: { status: Tracking['status']; label: string }[] = [
  { status: 'awaiting_rider', label: msg('Ready, waiting for a rider') },
  { status: 'assigned', label: msg('Rider on the way to collect it') },
  { status: 'picked_up', label: msg('On its way to you') },
  { status: 'delivered', label: msg('Delivered') },
]

/** Where an order is, who is bringing it, when it should arrive, and the code that proves it reached you. */
export function TrackDelivery() {
  const t = useT()
  const { orderId } = useParams<{ orderId: string }>()
  const tracking = useDeliveryTracking(orderId)
  const status = tracking.data?.status

  // A routed time, if a maps key is configured; otherwise this does nothing.
  useEffect(() => {
    if (orderId && (status === 'assigned' || status === 'picked_up')) void requestRoutedEta(orderId)
  }, [orderId, status])

  return (
    <Screen>
      <PageHeader title={`Delivery · #${orderId ? shortId(orderId) : ''}`} back={`/order/${orderId}`} />
      <div className="px-[22px] pb-8">
        <QueryState
          query={tracking}
          errorMessage={t('We could not load this delivery.')}
          isEmpty={(data) => data === null}
          empty={{ icon: 'ph-package', title: 'Not on its way yet', body: 'Tracking starts when the seller hands your order over for delivery.', action: <Link to={`/order/${orderId}`} className="text-[15px] font-semibold text-brand-hover">{t('View the order')}</Link> }}
        >
          {(tracking) => tracking && <Tracked tracking={tracking} orderId={orderId!} />}
        </QueryState>
      </div>
    </Screen>
  )
}

function Tracked({ tracking, orderId }: { tracking: Tracking; orderId: string }) {
  const t = useT()
  const setDropoff = useSetDeliveryDropoff()
  const [error, setError] = useState<string | null>(null)
  const active = tracking.status === 'awaiting_rider' || tracking.status === 'assigned' || tracking.status === 'picked_up'
  const eta = describeEta(tracking.eta_minutes)
  const step = STEPS.findIndex((s) => s.status === tracking.status)

  const markers: MapMarker[] = []
  if (tracking.pickup_lat != null && tracking.pickup_lng != null && tracking.status !== 'picked_up') markers.push({ kind: 'pickup', lat: Number(tracking.pickup_lat), lng: Number(tracking.pickup_lng), label: 'Collected from here' })
  if (tracking.dropoff_lat != null && tracking.dropoff_lng != null) markers.push({ kind: 'dropoff', lat: Number(tracking.dropoff_lat), lng: Number(tracking.dropoff_lng), label: 'Delivered here' })
  if (tracking.rider?.lat != null && tracking.rider.lng != null) markers.push({ kind: 'rider', lat: Number(tracking.rider.lat), lng: Number(tracking.rider.lng), label: 'Your rider' })

  function shareLocation() {
    setError(null)
    if (!('geolocation' in navigator)) return setError('This device cannot share its location.')
    navigator.geolocation.getCurrentPosition(
      (pos) => setDropoff.mutate({ orderId, lat: pos.coords.latitude, lng: pos.coords.longitude }, { onError: (e) => setError(friendlyError(e)) }),
      () => setError('We could not read your location. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  return (
    <>
      {tracking.status === 'cancelled' && <Alert tone="info" className="mt-4">{t('This delivery was cancelled. See the order for what happened.')}</Alert>}

      {active && (
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">{tracking.status === 'awaiting_rider' ? 'Finding a rider' : 'Estimated arrival'}</div>
          <div className="font-display font-bold text-[30px] leading-tight text-cream mt-1">{eta ?? (tracking.status === 'awaiting_rider' ? 'Shortly' : 'Working it out')}</div>
          {tracking.eta_at && <div className="text-[14px] text-muted-3 mt-0.5">Around {formatTime(tracking.eta_at)}</div>}
          {eta && (
            <p className="text-[12.5px] leading-[1.45] text-muted-3 mt-2">
              {tracking.eta_source === 'routed' ? 'From the route and current traffic.' : 'An estimate from the distance, the vehicle and the time of day. It does not know about traffic jams.'}
            </p>
          )}
        </div>
      )}

      {tracking.code && (
        <div className="bg-white border-[1.5px] border-brand rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">{t('Your delivery code')}</div>
          <div className="font-display font-bold text-[40px] tracking-[0.2em] text-ink mt-1">{tracking.code}</div>
          <p className="text-[13.5px] leading-[1.45] text-muted mt-1">
            {t('Give this to the rider only when the order is in your hands. It confirms delivery and releases your payment.')}
          </p>
        </div>
      )}

      {markers.length > 0 && <TrackMap markers={markers} className="h-[260px] mt-4" />}
      {active && tracking.code && (
        <button className="min-h-11 mt-2 text-[14px] font-semibold text-brand-hover" disabled={setDropoff.isPending} onClick={shareLocation}>
          {tracking.dropoff_lat == null ? 'Share where I am, for an arrival time' : 'Update the delivery point to where I am now'}
        </button>
      )}
      {active && tracking.rider && tracking.rider.lat == null && <p className="text-[13px] text-muted-2 mt-2">{t('The rider\'s position is not being shared right now.')}</p>}
      {error && <Alert className="mt-3">{error}</Alert>}

      {tracking.rider && (
        <>
          <SectionLabel className="mt-5 mb-2.5">{t('Your rider')}</SectionLabel>
          <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-moped text-[28px] text-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-[15.5px] font-semibold text-ink">{tracking.rider.name}</div>
              <div className="text-[13px] text-muted-2 mt-0.5">
                {t(VEHICLE[tracking.rider.vehicle])}{tracking.rider.plate ? ` · ${tracking.rider.plate}` : ''} · {tracking.rider.deliveries_done} deliver{tracking.rider.deliveries_done === 1 ? 'y' : 'ies'} done
              </div>
            </div>
          </div>
        </>
      )}

      <SectionLabel className="mt-5 mb-2.5">{t('Progress')}</SectionLabel>
      <ol className="bg-white border border-line rounded-2xl overflow-hidden">
        {STEPS.map((s, i) => {
          const done = tracking.status !== 'cancelled' && step >= i
          const at = s.status === 'assigned' ? tracking.assigned_at : s.status === 'picked_up' ? tracking.picked_up_at : s.status === 'delivered' ? tracking.delivered_at : null
          return (
            <li key={s.status} className={`flex items-center gap-3 px-4 py-3.5 ${i < STEPS.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <i className={`${done ? 'ph-fill ph-check-circle text-success' : 'ph ph-circle text-muted-4'} text-[20px]`} />
              <span className={`flex-1 text-[14.5px] ${done ? 'font-semibold text-ink' : 'text-muted'}`}>{t(s.label)}</span>
              {done && at && <span className="text-[12px] text-muted-2">{formatDateTime(at)}</span>}
            </li>
          )
        })}
      </ol>

      <SectionLabel className="mt-5 mb-2.5">{t('Delivering to')}</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4 text-[14.5px] leading-[1.5] text-text-soft whitespace-pre-line">{tracking.dropoff_address}</div>
    </>
  )
}
