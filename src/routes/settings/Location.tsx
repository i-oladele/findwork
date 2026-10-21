import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { LocationMap } from '../../components/ui/LocationMap'
import { FullScreenLoader } from '../../components/system/States'
import { useProfile, useServiceAreas, useSetMyLocation } from '../../lib/api'
import { nearestArea, type Point } from '../../lib/distance'
import { placeAt, searchPlaces, type Place } from '../../lib/geocoding'
import { friendlyError } from '../../lib/supabase'
import type { Profile } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

const GEOLOCATION_ERRORS: Record<number, string> = {
  1: 'Location access is blocked for FindWork. Allow it in your browser settings, or search for your address below.',
  2: 'We could not find your location just now. Search for your address below instead.',
  3: 'Finding your location took too long. Try again, or search for your address below.',
}

/**
 * "Add your area": use the phone's location, or search for a street,
 * landmark or area, and the spot is pinned on a map. The pin can be dragged
 * to the exact gate. Saving keeps the pin private and files the person under
 * the nearest listed area, which is what "nearest first" ranks on.
 */
export function Location() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading || !profile) return <FullScreenLoader />
  return <LocationForm profile={profile} />
}

function LocationForm({ profile }: { profile: Profile }) {
  const t = useT()
  const navigate = useNavigate()
  const save = useSetMyLocation()
  const { data: areas } = useServiceAreas()

  const [place, setPlace] = useState<Place | null>(
    profile.lat != null && profile.lng != null && profile.location_label
      ? { label: profile.location_label, detail: '', lat: Number(profile.lat), lng: Number(profile.lng) }
      : null,
  )
  const [resolving, setResolving] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  // Browsers only share the device's location with https sites and localhost.
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const request = new AbortController()
    const wait = setTimeout(async () => {
      setSearching(true)
      try {
        setSuggestions(await searchPlaces(q, request.signal))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => {
      clearTimeout(wait)
      request.abort()
    }
  }, [query])

  /** Pin a point and look up what is there; a newer move wins over an older lookup. */
  async function pinAt(point: Point) {
    const mine = ++latest.current
    setError(null)
    setPlace({ label: 'Finding the address…', detail: '', ...point })
    setResolving(true)
    const found = await placeAt(point.lat, point.lng).catch(() => null)
    if (mine !== latest.current) return
    setPlace(found ?? { label: 'Pinned location', detail: '', ...point })
    setResolving(false)
  }

  function choose(suggestion: Place) {
    latest.current++
    setPlace(suggestion)
    setResolving(false)
    setQuery('')
    setSuggestions([])
  }

  function locateMe() {
    setError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        void pinAt({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      (err) => {
        setLocating(false)
        setError(GEOLOCATION_ERRORS[err.code] ?? GEOLOCATION_ERRORS[2])
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  async function submit() {
    if (!place) return
    setError(null)
    try {
      await save.mutateAsync({ lat: place.lat, lng: place.lng, label: place.label })
      navigate('/home', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const area = place && areas ? nearestArea(areas, place) : null
  const shortQuery = query.trim().length < 3

  return (
    <Screen>
      <PageHeader title={t('Your location')} back="/home" />
      <div className="px-[22px] pb-8">
        <p className="text-[15px] leading-[1.55] text-muted">
          {t('We use it to show you providers near you. Only you can see your exact location.')}
        </p>

        <div className="relative mt-4">
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
            <i className="ph ph-magnifying-glass text-[19px] text-muted-2" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value.trim().length < 3) setSuggestions([])
              }}
              placeholder={t('Search for your street, area or a landmark')}
              aria-label={t('Search for your address')}
              autoComplete="street-address"
              className="flex-1 min-w-0 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
            />
            {searching && <span className="text-[12px] text-muted-2">{t('Searching…')}</span>}
          </div>
          {!shortQuery && suggestions.length > 0 && (
            <ul role="listbox" aria-label={t('Addresses')} className="absolute z-10 left-0 right-0 mt-1.5 bg-white border border-line rounded-xl shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <li key={`${s.lat},${s.lng},${s.label}`} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => choose(s)}
                    className="w-full flex items-start gap-3 px-3.5 py-3 text-left border-b border-line-soft last:border-b-0"
                  >
                    <i className="ph ph-map-pin text-[18px] text-brand mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink truncate">{s.label}</span>
                      {s.detail && <span className="block text-[12.5px] text-muted-2 truncate">{s.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!shortQuery && !searching && suggestions.length === 0 && (
            <p className="mt-2 text-[13px] text-muted-2">{t('No matches yet. Try a street name, a landmark or your area.')}</p>
          )}
        </div>

        {canLocate ? (
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="flex items-center gap-2.5 mt-3 text-[15px] font-semibold text-brand-hover disabled:opacity-50"
          >
            <i className="ph-bold ph-crosshair text-[18px]" />
            {locating ? 'Finding your location…' : 'Use my current location'}
          </button>
        ) : (
          <p className="mt-3 text-[13px] leading-[1.45] text-muted-2">
            {t('Your phone\'s location can only be used on the secure (https) FindWork site. Search for your address instead.')}
          </p>
        )}

        <LocationMap point={place} onMove={pinAt} className="h-[280px] mt-4" />
        <p className="mt-2 text-[13px] text-muted-2">{t('Drag the pin or tap the map to put it exactly where you are.')}</p>

        {place && (
          <div className="flex items-start gap-3 mt-4 bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-map-pin text-[22px] text-brand mt-0.5" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">{place.label}</div>
              <div className="text-[13px] text-muted-2 mt-0.5">
                {resolving
                  ? ' '
                  : area
                    ? `Near ${area.name}`
                    : "Outside the areas we list so far. We'll still show the closest providers."}
              </div>
            </div>
          </div>
        )}

        {error && <Alert className="mt-4">{error}</Alert>}

        <Button onClick={submit} disabled={!place || resolving} loading={save.isPending} className="mt-5 w-full">
          {t('Save my location')}
        </Button>
      </div>
    </Screen>
  )
}
