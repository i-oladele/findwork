import { Card } from './Card'
import { Badge } from './Badge'
import { StarRating } from './StarRating'
import { PlaceholderImage } from './PlaceholderImage'
import { formatNaira } from '../../lib/format'
import { describeDistance } from '../../lib/distance'
import type { ProviderProfile } from '../../lib/database.types'

/** One provider in a list: search results, the home feed. */
export function ProviderCard({
  provider: p,
  active,
  distanceKm,
}: {
  provider: ProviderProfile
  active?: boolean
  /** Crow-flies distance from the viewer, when both have an area set. */
  distanceKm?: number | null
}) {
  return (
    <Card to={`/provider/${p.id}`} active={active} className="flex gap-3.5 p-3.5 mt-3">
      <PlaceholderImage src={p.photo_urls[0]} className="w-[68px] h-[68px] flex-none" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display font-semibold text-[16px] text-ink truncate">{p.business_name}</span>
          {p.reviews > 0 ? (
            <StarRating rating={Number(p.rating)} reviews={p.reviews} />
          ) : (
            <span className="text-[12px] text-muted-2 whitespace-nowrap">No reviews yet</span>
          )}
        </div>
        <div className="text-[13px] text-muted-2 mt-0.5 truncate">
          {p.category} · {p.area ?? p.location}
          {describeDistance(distanceKm) && ` · ${describeDistance(distanceKm)}`}
        </div>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="font-display font-bold text-[15.5px] text-ink">
            {formatNaira(p.price)}
            <span className="text-xs font-normal text-muted-2"> / {p.price_unit}</span>
          </span>
          <span className="flex gap-1.5">
            {p.plan !== 'free' && <Badge tone="warning">Pro</Badge>}
            {p.verified ? (
              <Badge tone="success" icon="shield-check">
                Verified
              </Badge>
            ) : (
              <Badge tone="neutral">New</Badge>
            )}
          </span>
        </div>
        {!p.taking_bookings && <div className="text-[12px] text-warning-text mt-1.5">Not taking bookings right now</div>}
      </div>
    </Card>
  )
}
