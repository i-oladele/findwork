import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from '../../lib/distance'

const LAGOS: L.LatLngTuple = [6.5244, 3.3792]

// Drawn with the icon font rather than Leaflet's marker images, which do not
// survive bundling. The tip of the pin sits on the point.
const PIN = L.divIcon({
  className: '',
  html: '<i class="ph-fill ph-map-pin" style="font-size:44px;color:var(--color-brand);filter:drop-shadow(0 2px 2px rgb(0 0 0 / .3))"></i>',
  iconSize: [44, 44],
  iconAnchor: [22, 42],
})

/**
 * A map with one pin. Drag the pin, or tap the map, to move it; each move is
 * reported so the address can be looked up again. Map tiles come from
 * OpenStreetMap, whose terms ask for the credit shown in the corner.
 */
export function LocationMap({
  point,
  onMove,
  className = '',
}: {
  point: Point | null
  onMove: (point: Point) => void
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pin = useRef<L.Marker | null>(null)
  const report = useRef(onMove)

  useEffect(() => {
    report.current = onMove
  }, [onMove])

  useEffect(() => {
    const m = L.map(container.current!, { zoomControl: true }).setView(LAGOS, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => report.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.current = m
    return () => {
      m.remove()
      map.current = null
      pin.current = null
    }
  }, [])

  const lat = point?.lat
  const lng = point?.lng
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (lat == null || lng == null) {
      pin.current?.remove()
      pin.current = null
      return
    }
    const at = L.latLng(lat, lng)
    if (pin.current) {
      pin.current.setLatLng(at)
    } else {
      pin.current = L.marker(at, { draggable: true, icon: PIN, title: 'Your location', keyboard: true }).addTo(m)
      pin.current.on('dragend', () => {
        const moved = pin.current!.getLatLng()
        report.current({ lat: moved.lat, lng: moved.lng })
      })
    }
    m.setView(at, Math.max(m.getZoom(), 16))
  }, [lat, lng])

  return (
    <div
      ref={container}
      role="application"
      aria-label="Map. Drag the pin or tap the map to set your location."
      className={`relative z-0 rounded-2xl overflow-hidden border border-line bg-line-soft ${className}`}
    />
  )
}
