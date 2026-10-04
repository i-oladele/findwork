import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { useAuth } from '../../lib/authContext'
import { useClassifieds, useNearbyClassifieds, useProfile } from '../../lib/api'
import { TrackMap } from '../../components/ui/TrackMap'
import { Alert } from '../../components/ui/Alert'
import { formatDistance } from '../../lib/distance'
import { formatNaira } from '../../lib/format'
import type { ClassifiedCategory } from '../../lib/database.types'

const CATS = ['All', 'Rentals', 'Used goods'] as const

export function Classifieds() {
  const [cat, setCat] = useState<(typeof CATS)[number]>('All')
  const { user } = useAuth()
  const category = cat === 'All' ? undefined : (cat as ClassifiedCategory)
  const list = useClassifieds(category)
  const { data: profile } = useProfile()
  // "Near me" starts from the pinned location and can be refreshed from the device.
  const [nearMe, setNearMe] = useState(false)
  const [radius, setRadius] = useState(10)
  const [showMap, setShowMap] = useState(false)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const origin = here ?? (profile?.lat != null && profile.lng != null ? { lat: Number(profile.lat), lng: Number(profile.lng) } : null)
  const nearby = useNearbyClassifieds(nearMe ? origin : null, radius, category)

  function locateMe() {
    setLocating(null)
    if (!('geolocation' in navigator)) return setLocating('This device cannot share its location. Pin your location in Settings instead.')
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocating('We could not read your location. Allow location access, or pin your location in Settings.'),
      { timeout: 10_000 },
    )
  }

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Classifieds</h2>
          <Link to="/classifieds/new" aria-label="Post a listing" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>
        <p className="mt-1.5 text-[14px] text-muted">Rentals and used goods from other people. Deals here are between you and the seller — no escrow.</p>

        <div className="flex gap-2 mt-3.5">
          {CATS.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <Chip active={nearMe} icon={nearMe ? 'check' : undefined} onClick={() => { setNearMe(!nearMe); if (!nearMe && !origin) locateMe() }}>Near me</Chip>
          {nearMe && [5, 10, 25, 50].map((km) => <Chip key={km} active={radius === km} onClick={() => setRadius(km)}>{km} km</Chip>)}
          {nearMe && <Chip active={showMap} onClick={() => setShowMap(!showMap)}>Map</Chip>}
        </div>
        {nearMe && (
          <button className="min-h-11 text-[13.5px] font-semibold text-brand-hover" onClick={locateMe}>
            {origin ? 'Use where I am right now' : 'Share my location to search nearby'}
          </button>
        )}
        {locating && <Alert tone="info" className="mt-2">{locating}</Alert>}

        {nearMe ? (
          <QueryState query={nearby} errorMessage="We could not search nearby." isEmpty={(ads) => ads.length === 0}
            empty={{ icon: 'ph-map-pin', title: origin ? `Nothing within ${radius} km` : 'Share your location to search nearby', body: origin ? 'Try a wider distance. Listings posted without an area cannot be found this way.' : undefined }}>
            {(ads) => (
              <>
                {showMap && <TrackMap className="h-[240px] mt-3" markers={[
                  ...(origin ? [{ kind: 'rider' as const, lat: origin.lat, lng: origin.lng, label: 'You' }] : []),
                  ...ads.map((ad) => ({ kind: 'pickup' as const, lat: Number(ad.lat), lng: Number(ad.lng), label: ad.title })),
                ]} />}
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  {ads.map((ad) => (
                    <Link key={ad.id} to={`/classifieds/${ad.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
                      <PlaceholderImage src={ad.photo_urls[0]} className="h-[100px] w-full rounded-none" />
                      <div className="px-3 py-2.5">
                        <div className="text-[14.5px] font-semibold text-ink leading-[1.3] line-clamp-2">{ad.title}</div>
                        <div className="font-display font-bold text-base text-ink mt-1.5">{formatNaira(ad.price)}</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <i className="ph ph-map-pin text-xs text-muted-2" />
                          <span className="text-[11.5px] text-muted truncate">{formatDistance(ad.km)} · {ad.area ?? ad.location}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </QueryState>
        ) : (
        <QueryState
          query={list}
          errorMessage="We could not load listings."
          empty={{
            icon: 'ph-tag',
            title: 'Nothing listed yet',
            action: (
              <Link to="/classifieds/new" className="text-[15px] font-semibold text-brand-hover">
                Post the first listing
              </Link>
            ),
          }}
        >
          {(ads) => (
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              {ads.map((ad) => (
                <Link key={ad.id} to={`/classifieds/${ad.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
                  <PlaceholderImage src={ad.photo_urls[0]} className="h-[100px] w-full rounded-none" />
                  <div className="px-3 py-2.5">
                    <div className="text-[14.5px] font-semibold text-ink leading-[1.3] line-clamp-2">{ad.title}</div>
                    <div className="font-display font-bold text-base text-ink mt-1.5">
                      {formatNaira(ad.price)}
                      {ad.category === 'Rentals' && <span className="text-xs font-normal text-muted-2">/yr</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <i className="ph ph-map-pin text-xs text-muted-2" />
                      <span className="text-[11.5px] text-muted truncate">{ad.location}</span>
                      {ad.seller_id === user?.id && <span className="text-[10.5px] font-semibold text-brand-hover ml-auto">Yours</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </QueryState>
        )}
      </div>
    </Screen>
  )
}
