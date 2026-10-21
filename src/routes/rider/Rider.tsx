import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { Toggle } from '../../components/ui/Toggle'
import { ErrorState, FullScreenLoader } from '../../components/system/States'
import {
  reportRiderLocation,
  requestRoutedEta,
  useAcceptDelivery,
  useApplyAsRider,
  useAvailableDeliveries,
  useCompleteDelivery,
  useDeliveryTracking,
  useMarkPickedUp,
  useMyDeliveries,
  useMyRider,
  useReleaseDelivery,
  useRiderEarnings,
  useSetRiderOnline,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDistance, type Point } from '../../lib/distance'
import { formatNaira, shortId } from '../../lib/format'
import { describeEta, directionsUrl, planStops, routeKm, type Stop } from '../../lib/routing'
import { useRoutePlan } from '../../lib/api/logistics'
import type { Delivery, RiderProfile, RiderVehicle } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

const VEHICLES: { value: RiderVehicle; label: string }[] = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
]

/** Delivering for FindWork: apply, go online, take deliveries, hand them over, get paid. */
export function Rider() {
  const t = useT()
  const rider = useMyRider()
  if (rider.isLoading) return <FullScreenLoader />
  if (rider.isError) return <Screen><PageHeader title={t('Deliver')} back="/settings" /><ErrorState message="We could not load your rider profile." onRetry={() => void rider.refetch()} /></Screen>

  return (
    <Screen>
      <PageHeader title={t('Deliver with FindWork')} back="/settings" />
      <div className="px-[22px] pb-10">
        {!rider.data || rider.data.status === 'rejected' ? (
          <Apply previous={rider.data ?? null} />
        ) : rider.data.status === 'pending' ? (
          <Alert tone="info" className="mt-5">
            {t('Your application is with the team. You will get a notification when you can start delivering.')}
          </Alert>
        ) : (
          <Work rider={rider.data} />
        )}
      </div>
    </Screen>
  )
}

function Apply({ previous }: { previous: RiderProfile | null }) {
  const t = useT()
  const apply = useApplyAsRider()
  const [vehicle, setVehicle] = useState<RiderVehicle>(previous?.vehicle ?? 'motorcycle')
  const [plate, setPlate] = useState(previous?.plate ?? '')
  const [error, setError] = useState<string | null>(null)
  const needsPlate = vehicle !== 'bicycle'
  const valid = !needsPlate || plate.replace(/[^0-9A-Za-z]/g, '').length >= 3

  return (
    <>
      <p className="mt-4 text-[15px] leading-[1.55] text-muted">
        {t('Collect orders from sellers and deliver them to customers. You keep 80% of each delivery fee, paid into your wallet the moment the customer\'s code confirms the hand-over.')}
      </p>
      {previous?.status === 'rejected' && <Alert className="mt-4">Your last application was not approved: {previous.note ?? 'please check your details.'} You can apply again.</Alert>}
      <SectionLabel className="mt-5 mb-2.5">{t('How will you deliver?')}</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {VEHICLES.map((v) => <Chip key={v.value} active={vehicle === v.value} onClick={() => setVehicle(v.value)}>{v.label}</Chip>)}
      </div>
      {needsPlate && <div className="mt-5"><Input label={t('Plate number')} value={plate} onChange={setPlate} placeholder={t('LAG-123-XY')} autoCapitalize="none" /></div>}
      <p className="mt-4 text-[13.5px] leading-[1.5] text-muted-2">
        Riders must be ID verified. <Link to="/get-verified" className="font-semibold text-brand-hover">{t('Verify your ID')}</Link> if you have not yet: the team checks it before approving you.
      </p>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button className="mt-5" disabled={!valid} loading={apply.isPending} onClick={async () => {
        setError(null)
        try { await apply.mutateAsync({ vehicle, plate, area: null }) } catch (err) { setError(friendlyError(err)) }
      }}>{t('Apply to deliver')}</Button>
    </>
  )
}

/** Reports the rider's position while they are online, at most every 20 seconds. */
function useLocationReporting(online: boolean, onPosition: (point: Point) => void, onProblem: (message: string | null) => void) {
  const last = useRef(0)
  const handlers = useRef({ onPosition, onProblem })
  useEffect(() => { handlers.current = { onPosition, onProblem } })
  useEffect(() => {
    if (!online) return
    if (!('geolocation' in navigator)) {
      handlers.current.onProblem('This device cannot share its location, so customers will not see where you are.')
      return
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        handlers.current.onPosition(point)
        if (Date.now() - last.current < 20_000) return
        last.current = Date.now()
        handlers.current.onProblem(null)
        reportRiderLocation(point.lat, point.lng).catch(() => handlers.current.onProblem('Your location could not be sent. Check your connection.'))
      },
      () => handlers.current.onProblem('Allow location access so customers can see where their order is.'),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [online])
}

function Work({ rider }: { rider: RiderProfile }) {
  const t = useT()
  const setOnline = useSetRiderOnline()
  const available = useAvailableDeliveries(rider.online)
  const mine = useMyDeliveries(true)
  const earnings = useRiderEarnings(true)
  const accept = useAcceptDelivery()
  const [here, setHere] = useState<Point | null>(rider.lat != null && rider.lng != null ? { lat: Number(rider.lat), lng: Number(rider.lng) } : null)
  const [error, setError] = useState<string | null>(null)
  const [locationProblem, setLocationProblem] = useState<string | null>(null)
  useLocationReporting(rider.online, setHere, setLocationProblem)

  const active = mine.data ?? []
  const stops: Stop[] = active.flatMap((d) => {
    const list: Stop[] = []
    if (d.status === 'assigned' && d.pickup_lat != null && d.pickup_lng != null) {
      list.push({ id: `${d.id}:pickup`, kind: 'pickup', deliveryId: d.id, lat: Number(d.pickup_lat), lng: Number(d.pickup_lng), label: `Collect #${shortId(d.order_id)} · ${d.pickup_address ?? ''}` })
    }
    if (d.dropoff_lat != null && d.dropoff_lng != null) {
      list.push({ id: `${d.id}:dropoff`, kind: 'dropoff', deliveryId: d.id, lat: Number(d.dropoff_lat), lng: Number(d.dropoff_lng), label: `Deliver #${shortId(d.order_id)}` })
    }
    return list
  })
  const routed = useRoutePlan(Boolean(here) && stops.length > 1, stops.map((s) => s.id).join(','))
  // Road times in current traffic when the maps service answers; otherwise the shortest round on straight lines.
  const roadPlan = routed.data && routed.data.stops.length === stops.length ? routed.data : null
  const plan = here && stops.length > 1
    ? roadPlan ? roadPlan.stops.map((r) => stops.find((s) => s.id === r.id)!).filter(Boolean) : planStops(here, stops)
    : null

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-ink rounded-2xl p-[18px] mt-4">
        <div>
          <div className="font-display font-semibold text-[17px] text-cream">{rider.online ? 'You are online' : 'You are offline'}</div>
          <div className="text-[13px] text-muted-3 mt-0.5">{rider.online ? 'New deliveries appear below. Your position is shared with customers whose orders you carry.' : 'Go online to see deliveries near you.'}</div>
        </div>
        <Toggle label={t('Online')} on={rider.online} disabled={setOnline.isPending} onChange={(on) => { setError(null); setOnline.mutate(on, { onError: (e) => setError(friendlyError(e)) }) }} />
      </div>
      {locationProblem && rider.online && <Alert tone="info" className="mt-3">{locationProblem}</Alert>}
      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <Stat label={t('Today')} value={formatNaira(earnings.data?.today ?? 0)} />
        <Stat label={t('All time')} value={formatNaira(earnings.data?.total ?? 0)} />
        <Stat label={t('Delivered')} value={String(rider.deliveries_done)} />
      </div>
      <Link to="/wallet" className="inline-block min-h-11 pt-3 text-[14px] font-semibold text-brand-hover">{t('Earnings go to your wallet')}</Link>

      {active.length > 0 && (
        <>
          <SectionLabel className="mt-4 mb-2.5">{t('Your deliveries')}</SectionLabel>
          {active.map((d) => <ActiveDelivery key={d.id} delivery={d} />)}
        </>
      )}

      {plan && here && (
        <>
          <SectionLabel className="mt-5 mb-2.5">{t('Suggested order of stops')}</SectionLabel>
          <div className="bg-white border border-line rounded-2xl p-4">
            <ol className="space-y-2">
              {plan.map((stop, i) => {
                const minutes = roadPlan?.stops.find((r) => r.id === stop.id)?.minutes
                return (
                  <li key={stop.id} className="flex gap-2.5 text-[14px] text-ink">
                    <span className="font-mono text-muted-2">{i + 1}.</span>
                    <span className="flex-1 min-w-0 truncate">{stop.label}</span>
                    {minutes != null && <span className="flex-none text-[12.5px] text-muted-2">{describeEta(minutes)?.replace('About ', '~')}</span>}
                  </li>
                )
              })}
            </ol>
            <p className="mt-3 text-[12.5px] leading-[1.45] text-muted-2">
              {roadPlan
                ? `The quickest order on the roads in current traffic: ${describeEta(roadPlan.total_minutes)?.toLowerCase() ?? 'a few minutes'}${roadPlan.total_km != null ? `, ${formatDistance(roadPlan.total_km)}` : ''}, collecting each order before delivering it.`
                : `${formatDistance(routeKm(here, plan))} in a straight line: the shortest order with each order collected before it is delivered. Road times and traffic are used once a maps key is set.`}
            </p>
            <a href={directionsUrl(here, plan) ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 text-[14px] font-semibold text-brand-hover">
              {t('Open directions in Google Maps')}
            </a>
          </div>
        </>
      )}

      {rider.online && (
        <>
          <SectionLabel className="mt-5 mb-2.5">{t('Waiting for a rider')}</SectionLabel>
          {available.isError && <Alert>We could not load deliveries. <button className="underline" onClick={() => void available.refetch()}>{t('Retry')}</button></Alert>}
          {available.data?.length === 0 && <p className="text-[14px] text-muted py-4">{t('Nothing waiting right now. This list refreshes on its own.')}</p>}
          {available.data?.map((job) => (
            <div key={job.id} className="bg-white border border-line rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-[17px] text-ink">{formatNaira(job.rider_fee)}</span>
                {job.delivery_speed === 'same-day' && <Badge tone="warning" icon="lightning">{t('Same day')}</Badge>}
              </div>
              <div className="text-[14px] text-ink mt-1.5">From {job.pickup_address ?? 'FindWork fulfilment'}</div>
              <div className="text-[14px] text-ink">To {job.dropoff_area}</div>
              <div className="text-[12.5px] text-muted-2 mt-1">
                {job.pickup_km != null ? `${formatDistance(job.pickup_km)} to collect` : 'Distance to collect unknown'}
                {job.trip_km != null ? ` · ${formatDistance(job.trip_km)} trip` : ''}
              </div>
              <Button className="mt-3 h-12" loading={accept.isPending && accept.variables === job.id} disabled={accept.isPending} onClick={() => {
                setError(null)
                accept.mutate(job.id, { onError: (e) => setError(friendlyError(e)) })
              }}>{t('Take this delivery')}</Button>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function ActiveDelivery({ delivery: d }: { delivery: Delivery }) {
  const t = useT()
  const tracking = useDeliveryTracking(d.order_id)
  const pickUp = useMarkPickedUp()
  const release = useReleaseDelivery()
  const complete = useCompleteDelivery()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pending = pickUp.isPending || release.isPending || complete.isPending
  const eta = describeEta(d.eta_minutes)

  useEffect(() => { void requestRoutedEta(d.order_id) }, [d.order_id, d.status])

  return (
    <div className="bg-white border-[1.5px] border-brand rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">Order #{shortId(d.order_id)}</span>
        <Badge tone={d.status === 'picked_up' ? 'success' : 'warning'}>{d.status === 'picked_up' ? 'Carrying' : 'To collect'}</Badge>
      </div>
      {d.status === 'assigned' && <div className="text-[14.5px] text-ink mt-2"><span className="font-semibold">{t('Collect from')}</span> {d.pickup_address ?? 'FindWork fulfilment'}</div>}
      <div className="text-[14.5px] text-ink mt-1.5 whitespace-pre-line"><span className="font-semibold">{t('Deliver to')}</span> {d.dropoff_address}</div>
      {tracking.data?.contact_phone && (
        <a href={`tel:${tracking.data.contact_phone}`} className="inline-flex items-center gap-1.5 min-h-11 text-[14.5px] font-semibold text-brand-hover">
          <i className="ph-fill ph-phone" /> Call the customer
        </a>
      )}
      <div className="text-[12.5px] text-muted-2">{formatNaira(d.rider_fee)} on delivery{eta ? ` · ${eta.toLowerCase()} to go` : ''}</div>
      {error && <Alert className="mt-3">{error}</Alert>}

      {d.status === 'assigned' ? (
        <div className="flex gap-2.5 mt-3">
          <button disabled={pending} className="flex-1 h-11 bg-success text-white rounded-lg text-[14.5px] font-semibold disabled:opacity-50" onClick={() => {
            setError(null)
            pickUp.mutate(d.id, { onError: (e) => setError(friendlyError(e)) })
          }}>{t('I have collected it')}</button>
          <button disabled={pending} className="px-4 h-11 border border-line rounded-lg text-[14px] font-semibold text-muted disabled:opacity-50" onClick={() => {
            if (!window.confirm('Give this delivery back? Another rider will be able to take it.')) return
            setError(null)
            release.mutate(d.id, { onError: (e) => setError(friendlyError(e)) })
          }}>{t('Give back')}</button>
        </div>
      ) : (
        <form className="flex gap-2.5 mt-3" onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          complete.mutate({ deliveryId: d.id, code }, { onError: (err) => { setError(friendlyError(err)); setCode('') } })
        }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={4} placeholder={t('Customer\'s code')} aria-label={`Delivery code for order ${shortId(d.order_id)}`}
            className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 font-display font-bold text-[18px] tracking-[0.2em] text-ink outline-none placeholder:text-[14px] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-2" />
          <button type="submit" disabled={pending || code.replace(/\D/g, '').length !== 4} className="px-4 h-11 bg-success text-white rounded-lg text-[14.5px] font-semibold disabled:opacity-50">{t('Delivered')}</button>
        </form>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-line rounded-xl p-3">
      <div className="text-[11.5px] text-muted-2">{label}</div>
      <div className="font-display font-bold text-[16px] text-ink mt-0.5 break-words">{value}</div>
    </div>
  )
}
