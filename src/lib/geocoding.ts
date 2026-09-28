/**
 * Turning an address into a point on the map, and a point back into an
 * address, for "Add your area".
 *
 * Uses Photon (photon.komoot.io), a free search service over OpenStreetMap
 * data: no key, no bill, and it knows Lagos streets, landmarks and areas
 * well. It asks for fair use, which suits the app's size now. If coverage or
 * volume outgrows it (Google Places knows more Nigerian house numbers), this
 * file is the only one to change.
 *
 * What is typed is sent to Photon to search; nothing about the person is.
 */
export type Place = {
  /** One line to show and to save: "Yaba College of Technology, Herbert Macaulay Way, Yaba". */
  label: string
  /** The line under it in suggestions: "Yaba, Lagos". */
  detail: string
  lat: number
  lng: number
}

const PHOTON = 'https://photon.komoot.io'
// Results near Lagos come first; results outside Nigeria are left out.
const LAGOS = { lat: 6.5244, lng: 3.3792 }
const NIGERIA_BBOX = '2.67,4.27,14.68,13.89'

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    state?: string
    countrycode?: string
  }
}

/** A Photon result as one readable place, skipping parts that repeat. */
export function toPlace(feature: PhotonFeature): Place {
  const p = feature.properties
  const road = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : undefined
  // A road's name is its street: say "14 Herbert Macaulay Way", not both.
  const name = p.name && p.street && p.name.toLowerCase() === p.street.toLowerCase() ? undefined : p.name
  const area = p.district ?? p.locality ?? p.city
  const parts: string[] = []
  for (const part of [name, road, area]) {
    if (part && !parts.some((seen) => seen.toLowerCase() === part.toLowerCase())) parts.push(part)
  }
  const detail = [area, p.city !== area ? p.city : undefined, p.state].filter(Boolean)
  return {
    label: parts.join(', ') || p.state || 'Pinned location',
    detail: [...new Set(detail)].join(', '),
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  }
}

/** Suggestions as someone types: streets, landmarks and areas in Nigeria. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({
    q,
    limit: '6',
    lang: 'en',
    lat: String(LAGOS.lat),
    lon: String(LAGOS.lng),
    bbox: NIGERIA_BBOX,
  })
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal })
  if (!res.ok) throw new Error('Address search is unavailable. Try again in a moment.')
  const body = (await res.json()) as { features?: PhotonFeature[] }
  return (body.features ?? []).map(toPlace)
}

/** The nearest named place to a point, for a pin that was dropped or dragged. */
export async function placeAt(lat: number, lng: number, signal?: AbortSignal): Promise<Place> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: 'en' })
  try {
    const res = await fetch(`${PHOTON}/reverse?${params}`, { signal })
    const body = (await res.json()) as { features?: PhotonFeature[] }
    const found = body.features?.[0]
    // The pin stays where it was put, whatever the nearest named thing is.
    if (found) return { ...toPlace(found), lat, lng }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
  }
  return { label: 'Pinned location', detail: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng }
}
