import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Chip } from '../../components/ui/Chip'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TrackMap } from '../../components/ui/TrackMap'
import { TrustBadge } from '../../components/ui/TrustBadge'
import { EmptyState, ErrorState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  sendSharedLocation,
  useMeetup,
  useMeetupLocations,
  useProfile,
  useStartLocationShare,
  useStopLocationShare,
  useTrustedContacts,
  useUpdateMeetup,
  type MeetupWithPeople,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime, formatTime } from '../../lib/format'
import { MEETUP_STATUS, safetyMessage, smsLink } from '../../lib/safety'
import { SosButton } from './SosButton'

export function MeetupDetail() {
  const { id } = useParams<{ id: string }>()
  const meetup = useMeetup(id)
  if (meetup.isLoading) return <FullScreenLoader />
  return (
    <Screen>
      <PageHeader title="Meet-up" back="/meetups" />
      <div className="px-[22px] pb-10">
        {meetup.isError ? <ErrorState message="We could not load this meet-up." onRetry={() => void meetup.refetch()} />
          : !meetup.data ? <EmptyState icon="ph-handshake" title="Meet-up not found" />
            : <Detail m={meetup.data} />}
      </div>
    </Screen>
  )
}

function Detail({ m }: { m: MeetupWithPeople }) {
  const { user } = useAuth()
  const update = useUpdateMeetup()
  const [error, setError] = useState<string | null>(null)
  const iAmSeller = user?.id === m.seller_id
  const other = iAmSeller ? m.buyer : m.seller
  const otherId = iAmSeller ? m.buyer_id : m.seller_id
  const open = m.status === 'proposed' || m.status === 'confirmed'
  const act = (action: 'confirm' | 'complete' | 'cancel', confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setError(null)
    update.mutate({ id: m.id, action }, { onError: (e) => setError(friendlyError(e)) })
  }

  return (
    <>
      <div className="bg-white border border-line rounded-2xl p-[18px] mt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display font-semibold text-[17px] text-ink">{m.title}</span>
          <Badge tone={MEETUP_STATUS[m.status].tone}>{MEETUP_STATUS[m.status].label}</Badge>
        </div>
        <div className="text-[15px] text-ink mt-2">{formatDateTime(m.meet_at)}</div>
        <div className="text-[14.5px] text-text-soft mt-0.5">{m.place}</div>
        {m.classified_id && <Link to={`/classifieds/${m.classified_id}`} className="inline-block min-h-11 pt-2.5 text-[14px] font-semibold text-brand-hover">View the listing</Link>}
      </div>

      <SectionLabel className="mt-5 mb-2.5">You are meeting</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4">
        <div className="text-[15.5px] font-semibold text-ink">{other?.full_name || 'A FindWork user'}</div>
        <div className="mt-1.5"><TrustBadge tier={other?.verification_tier} score={other?.trust_score} /></div>
        <Link to={`/chat/with/${otherId}`} className="inline-block min-h-11 pt-2.5 text-[14px] font-semibold text-brand-hover">Message them</Link>
      </div>

      {error && <Alert className="mt-4">{error}</Alert>}
      {open && (
        <div className="flex flex-wrap gap-x-5 mt-3 text-[14.5px] font-semibold">
          {iAmSeller && m.status === 'proposed' && <button disabled={update.isPending} className="min-h-11 text-success-text" onClick={() => act('confirm')}>Confirm this meet-up</button>}
          {m.status === 'confirmed' && <button disabled={update.isPending} className="min-h-11 text-success-text" onClick={() => act('complete')}>We have met</button>}
          <button disabled={update.isPending} className="min-h-11 text-muted" onClick={() => act('cancel', 'Cancel this meet-up?')}>Cancel</button>
        </div>
      )}

      {open && <Sharing m={m} />}
      {open && <SosButton meetupId={m.id} place={m.place} />}

      <SectionLabel className="mt-5 mb-2.5">Meet safely</SectionLabel>
      <ul className="bg-white border border-line rounded-2xl p-4 space-y-2 text-[14px] leading-[1.45] text-text-soft">
        <li>Meet in a public place, in daylight, and take someone with you.</li>
        <li>Tell a trusted contact where you are going before you leave.</li>
        <li>See and test the item before paying. Never send money ahead.</li>
        <li>If it feels wrong, leave. You owe nobody an explanation.</li>
      </ul>
    </>
  )
}

const DURATIONS = [15, 30, 60, 120]

/** Share your position with the other person for a set time, and see theirs if they share. */
function Sharing({ m }: { m: MeetupWithPeople }) {
  const { data: profile } = useProfile()
  const { data: contacts } = useTrustedContacts()
  const locations = useMeetupLocations(m.id, true)
  const start = useStartLocationShare()
  const stop = useStopLocationShare()
  const [minutes, setMinutes] = useState(30)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sharing = Boolean(locations.data?.mine)
  const last = useRef(0)

  useEffect(() => {
    if (!sharing) return
    if (!('geolocation' in navigator)) {
      setError('This device cannot share its location.')
      return
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setHere(point)
        if (Date.now() - last.current < 15_000) return
        last.current = Date.now()
        sendSharedLocation(m.id, point.lat, point.lng).catch((err) => setError(friendlyError(err)))
      },
      () => setError('Allow location access to share where you are.'),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [sharing, m.id])

  const theirs = locations.data?.theirs
  const name = profile?.full_name || 'me'

  return (
    <>
      <SectionLabel className="mt-5 mb-2.5">Location sharing</SectionLabel>
      <div className="bg-white border border-line rounded-2xl p-4">
        {sharing ? (
          <>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><i className="ph-fill ph-broadcast text-success" /> You are sharing your location</div>
            <p className="text-[13.5px] text-muted-2 mt-1">Until {formatTime(locations.data!.mine!.expires_at)}, with the person you are meeting only. It stops by itself.</p>
            <button disabled={stop.isPending} className="min-h-11 mt-1 text-[14.5px] font-semibold text-danger" onClick={() => { setError(null); stop.mutate(m.id, { onError: (e) => setError(friendlyError(e)) }) }}>Stop sharing now</button>
          </>
        ) : (
          <>
            <p className="text-[14px] leading-[1.45] text-text-soft">Let the person you are meeting see where you are, for a set time. Nothing is shared until you start, and it ends on its own.</p>
            <div className="flex flex-wrap gap-2 mt-3">{DURATIONS.map((d) => <Chip key={d} active={minutes === d} onClick={() => setMinutes(d)}>{d < 60 ? `${d} min` : `${d / 60} hr`}</Chip>)}</div>
            <button disabled={start.isPending} className="min-h-11 mt-2 text-[14.5px] font-semibold text-brand" onClick={() => { setError(null); start.mutate({ meetupId: m.id, minutes }, { onError: (e) => setError(friendlyError(e)) }) }}>Share my location for {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}</button>
          </>
        )}
        {error && <Alert className="mt-3">{error}</Alert>}
        {theirs ? (
          <>
            <p className="text-[13.5px] text-text-soft mt-3">The other person is sharing their location with you until {formatTime(theirs.expires_at)}.</p>
            <TrackMap markers={[{ kind: 'dropoff', lat: Number(theirs.lat), lng: Number(theirs.lng), label: 'The person you are meeting' }]} className="h-[200px] mt-2" />
          </>
        ) : (
          <p className="text-[13px] text-muted-2 mt-3">The other person is not sharing their location.</p>
        )}
        {(contacts ?? []).length > 0 && (
          <div className="border-t border-line-soft mt-3 pt-2">
            <div className="text-[13px] text-muted-2">Tell a trusted contact where you are going</div>
            {contacts!.map((c) => (
              <a key={c.id} href={smsLink(c.phone, safetyMessage({ name, place: m.place, lat: here?.lat, lng: here?.lng, urgent: false }))} className="flex min-h-11 items-center text-[14.5px] font-semibold text-brand-hover">
                Text {c.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
