/**
 * Straight-line distance between two points, for ranking "who is nearest".
 *
 * It is the crow-flies distance, not a driving route — on Lagos roads the
 * real journey is usually longer, so the number is shown as "about" and used
 * mainly for ordering. Ranking happens on the client over the providers
 * already fetched; if the directory grows past a page, this belongs in the
 * database (PostGIS or earthdistance) instead.
 */
const EARTH_RADIUS_KM = 6371

export type Point = { lat: number; lng: number }

export function distanceKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Anything carrying coordinates: a profile, a provider, an area. */
export type MaybeLocated = { lat?: number | null; lng?: number | null } | null | undefined

/** Null when either side has no area set, which is the normal case at first. */
export function distanceBetween(a: MaybeLocated, b: MaybeLocated): number | null {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null
  return distanceKm({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) })
}

/** "1.2 km", "450 m", "12 km" — precision that matches how rough the number is. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 10) * 100} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

/**
 * The phrase shown next to a provider. Everyone in the same area shares one
 * set of coordinates, so the distance between them is zero — say "in your
 * area" rather than the daft "about 0 m away".
 */
export function describeDistance(km: number | null | undefined): string | null {
  if (km == null) return null
  if (km < 0.5) return 'in your area'
  return `about ${formatDistance(km)} away`
}
