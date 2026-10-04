import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from '../../lib/distance'

const LAGOS: L.LatLngTuple = [6.5244, 3.3792]

const icon = (name: string, color: string) =>
  L.divIcon({
    className: '',
    html: `<i class="ph-fill ph-${name}" style="font-size:34px;color:${color};filter:drop-shadow(0 2px 2px rgb(0 0 0 / .3))"></i>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
  })

export type MapMarker = Point & { kind: 'rider' | 'pickup' | 'dropoff'; label: string }

const ICONS = {
  rider: icon('moped', 'var(--color-brand)'),
  pickup: icon('storefront', 'var(--color-ink)'),
  dropoff: icon('house', 'var(--color-success)'),
}

/**
 * A read-only map of a delivery: where the order is collected, where it is
 * going, and the rider if their position is being shared. Tiles come from
 * OpenStreetMap, whose terms ask for the credit shown in the corner.
 */
export function TrackMap({ markers, className = '' }: { markers: MapMarker[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const m = L.map(container.current!, { zoomControl: true }).setView(LAGOS, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
      layer.current = null
    }
  }, [])

  const key = markers.map((m) => `${m.kind}:${m.lat},${m.lng}`).join('|')
  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group) return
    group.clearLayers()
    for (const marker of markers) {
      L.marker([marker.lat, marker.lng], { icon: ICONS[marker.kind], title: marker.label, keyboard: false }).addTo(group)
    }
    if (markers.length === 1) m.setView([markers[0].lat, markers[0].lng], 15)
    else if (markers.length > 1) m.fitBounds(L.latLngBounds(markers.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [36, 36] })
    // The marker list is rebuilt each render; the key says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return <div ref={container} role="img" aria-label="Map of the delivery" className={`rounded-2xl overflow-hidden border border-line ${className}`} />
}
