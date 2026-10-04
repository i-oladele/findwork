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

const VEHICLE = { bicycle: 'Bicycle', motorcycle: 'Motorcycle', car: 'Car', van: 'Van' } as const

const STEPS: { status: Tracking['status']; label: string }[] = [
  { status: 'awaiting_rider', label: 'Ready, waiting for a rider' },
  { status: 'assigned', label: 'Rider on the way to collect it' },
  { status: 'picked_up', label: 'On its way to you' },
  { status: 'delivered', label: 'Delivered' },
]

/** Where an order is, who is bringing it, when it should arrive, and the code that proves it reached you. */
export function TrackDelivery() {
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
          errorMessage="We could not load this delivery."
          isEmpty={(data) => data === null}
          empty={{ icon: 'ph-package', title: 'Not on its way yet', body: 'Tracking starts when the seller hands your order over for delivery.', action: <Link to={`/order/${orderId}`} className="text-[15px] font-semibold text-brand-hover">View the order</Link> }}
        >
          {(t) => t && <Tracked t={t} orderId={orderId!} />}
        </QueryState>
      </div>
    </Screen>
  )
}

function Tracked({ t, orderId }: { t: Tracking; orderId: string }) {
  const setDropoff = useSetDeliveryDropoff()
  const [error, setError] = useState<string | null>(null)
  const active = t.status === 'awaiting_rider' || t.status === 'assigned' || t.status === 'picked_up'
  const eta = describeEta(t.eta_minutes)
  const step = STEPS.findIndex((s) => s.status === t.status)

  const markers: MapMarker[] = []
  if (t.pickup_lat != null && t.pickup_lng != null && t.status !== 'picked_up') markers.push({ kind: 'pickup', lat: Number(t.pickup_lat), lng: Number(t.pickup_lng), label: 'Collected from here' })
  if (t.dropoff_lat != null && t.dropoff_lng != null) markers.push({ kind: 'dropoff', lat: Number(t.dropoff_lat), lng: Number(t.dropoff_lng), label: 'Delivered here' })
  if (t.rider?.lat != null && t.rider.lng != null) markers.push({ kind: 'rider', lat: Number(t.rider.lat), lng: Number(t.rider.lng), label: 'Your rider' })

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
      {t.status === 'cancelled' && <Alert tone="info" className="mt-4">This delivery was cancelled. See the order for what happened.</Alert>}

      {active && (
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">{t.status === 'awaiting_rider' ? 'Finding a rider' : 'Estimated arrival'}</div>
          <div className="font-display font-bold text-[30px] leading-tight text-cream mt-1">{eta ?? (t.status === 'awaiting_rider' ? 'Shortly' : 'Working it out')}</div>
          {t.eta_at && <div className="text-[14px] text-muted-3 mt-0.5">Around {formatTime(t.eta_at)}</div>}
          {eta && (
            <p className="text-[12.5px] leading-[1.45] text-muted-3 mt-2">
              {t.eta_source === 'routed' ? 'From the route and current traffic.' : 'An estimate from the distance, the vehicle and the time of day. It does not know about traffic jams.'}
            </p>
          )}
        </div>
      )}

      {t.code && (
        <div className="bg-white border-[1.5px] border-brand rounded-2xl p-[18px] mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Your delivery code</div>
          <div className="font-display font-bold text-[40px] tracking-[0.2em] text-ink mt-1">{t.code}</div>
          <p className="text-[13.5px] leading-[1.45] text-muted mt-1">
            Give this to the rider only when the order is in your hands. It confirms delivery and releases your payment.
          </p>
        </div>
      )}

      {markers.length > 0 && <TrackMap markers={markers} className="h-[260px] mt-4" />}
      {active && t.code && (
        <button className="min-h-11 mt-2 text-[14px] font-semibold text-brand-hover" disabled={setDropoff.isPending} onClick={shareLocation}>
          {t.dropoff_lat == null ? 'Share where I am, for an arrival time' : 'Update the delivery point to where I am now'}
        </button>
      )}
      {active && t.rider && t.rider.lat == null && <p className="text-[13px] text-muted-2 mt-2">The rider's position is not being shared right now.</p>}
      {error && <Alert className="mt-3">{error}</Alert>}

      {t.rider && (
        <>
          <SectionLabel className="mt-5 mb-2.5">Your rider</SectionLabel>
          <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-moped text-[28px] text-brand" />
            <div className="flex-1 min-w-0">
              <div className="text-[15.5px] font-semibold text-ink">{t.rider.name}</div>
              <div className="text-[13px] text-muted-2 mt-0.5">
                {VEHICLE[t.rider.vehicle]}{t.rider.plate ? ` · ${t.rider.plate}` : ''} · {t.rider.deliveries_done} deliver{t.rider.deliveries_done === 1 ? 'y' : 'ies'} done
              </div>
            </div>
          </div>
        </>
      )}

      <SectionLabel className="mt-5 mb-2.5">Progress</SectionLabel>
      <ol className="bg-white border border-line rounded-2xl overflow-hidden">
        {STEPS.map((s, i) => {
          const done = t.status !== 'cancelled' && step >= i
          const at = s.status === 'assigned' ? t.assigned_at : s.status === 'picked_up' ? t.picked_up_at : s.status === 'delivered' ? t.delivered_at : null
          return (
            <li key={s.status} className={`flex items-center gap-3 px-4 py-3.5 ${i < STEPS.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <i className={`${done ? 'ph-fill ph-check-circle text-success' : 'ph ph-circle text-muted-4'} text-[20px]`} />
              <span className={`flex-1 text-[14.5px] ${done ? 'font-semibold text-ink' : 'text-muted'}`}>{s.label}</span>
              {done && at && <span className="text-[12px] text-muted-2">{formatDateTime(at)}</span>}
            </li>
          )
        })}
      </ol>

      <SectionLabel className="mt-5 mb-2.5">Delivering to</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4 text-[14.5px] leading-[1.5] text-text-soft whitespace-pre-line">{t.dropoff_address}</div>
    </>
  )
}
