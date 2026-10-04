import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { useAuth } from '../../lib/authContext'
import { useClassified, useMeetups, useProposeMeetup } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import { SosButton } from './SosButton'
import { MEETUP_STATUS } from '../../lib/safety'

const SAFE_PLACES = ['A shopping mall entrance', 'Inside a bank branch', 'A busy filling station', 'A police station forecourt']

/** Your arranged meet-ups, and the SOS button. */
export function Meetups() {
  const { user } = useAuth()
  const meetups = useMeetups()
  return (
    <Screen>
      <PageHeader title="Meet-ups and SOS" back="/settings" />
      <div className="px-[22px] pb-10">
        <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">
          Arrange a meet-up from any classified listing. Each one lets you share your location with the other person for a set time, and reach help quickly.
        </p>
        <SosButton meetupId={null} place={null} />
        <Link to="/security" className="inline-block min-h-11 pt-3 text-[14px] font-semibold text-brand-hover">Manage trusted contacts</Link>
        <SectionLabel className="mt-4 mb-2.5">Your meet-ups</SectionLabel>
        <QueryState query={meetups} errorMessage="We could not load your meet-ups." empty={{ icon: 'ph-handshake', title: 'No meet-ups yet', body: 'Open a classified listing and choose "Arrange to meet".' }}>
          {(rows) => rows.map((m) => {
            const other = user?.id === m.buyer_id ? m.seller : m.buyer
            return (
              <Link key={m.id} to={`/meetups/${m.id}`} className="block bg-white border border-line rounded-2xl p-4 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-[15.5px] text-ink truncate">{m.title}</span>
                  <Badge tone={MEETUP_STATUS[m.status].tone}>{MEETUP_STATUS[m.status].label}</Badge>
                </div>
                <div className="text-[13.5px] text-text-soft mt-1.5">{formatDateTime(m.meet_at)} · {m.place}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">With {other?.full_name || 'a FindWork user'}</div>
              </Link>
            )
          })}
        </QueryState>
      </div>
    </Screen>
  )
}

/** Propose a time and a public place to the seller of a listing. */
export function NewMeetup() {
  const { classifiedId } = useParams<{ classifiedId: string }>()
  const navigate = useNavigate()
  const { data: ad } = useClassified(classifiedId)
  const propose = useProposeMeetup()
  const [place, setPlace] = useState('')
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const at = when ? new Date(when) : null
  const valid = place.trim().length >= 3 && at !== null && at.getTime() > Date.now()

  return (
    <Screen>
      <PageHeader title="Arrange to meet" back={`/classifieds/${classifiedId}`} icon="x" />
      <div className="px-[22px] pb-8">
        {ad && <p className="mt-3 text-[15px] text-ink font-semibold">{ad.title}</p>}
        <p className="mt-1.5 text-[14.5px] leading-[1.5] text-muted">
          Choose a public place, in daylight. The seller is asked to confirm. FindWork escrow does not cover classifieds: see and test the item before paying.
        </p>
        <SectionLabel className="mt-5 mb-2.5">Where</SectionLabel>
        <div className="flex flex-wrap gap-2 mb-3">
          {SAFE_PLACES.map((s) => <Chip key={s} active={place === s} onClick={() => setPlace(s)}>{s}</Chip>)}
        </div>
        <Input value={place} onChange={setPlace} placeholder="Name the place: Ikeja City Mall, main entrance" icon="map-pin" />
        <SectionLabel className="mt-5 mb-2.5">When</SectionLabel>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time"
          className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink" />
        {error && <Alert className="mt-4">{error}</Alert>}
        <Button className="mt-6" disabled={!valid} loading={propose.isPending} onClick={async () => {
          setError(null)
          try {
            const id = await propose.mutateAsync({ classifiedId: classifiedId!, place: place.trim(), meetAt: at!.toISOString() })
            navigate(`/meetups/${id}`, { replace: true })
          } catch (err) { setError(friendlyError(err)) }
        }}>Ask to meet</Button>
      </div>
    </Screen>
  )
}
