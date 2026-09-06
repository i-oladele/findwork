import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { StarRating } from '../../components/ui/StarRating'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { providers, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Home() {
  const profile = useAppStore((s) => s.profile)
  const firstName = profile.fullName.split(' ')[0]
  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-[22px]">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <div className="text-[13.5px] text-muted-3">Good morning, {firstName}</div>
            <Link to="/search" className="flex items-center gap-1.5 mt-1 font-display font-semibold text-[16px] text-cream">
              <i className="ph-fill ph-map-pin text-brand text-[15px]" />
              {profile.location}
              <i className="ph-bold ph-caret-down text-xs" />
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link to="/notifications" className="inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-bell text-[22px]" />
            </Link>
            <Link to="/settings" className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-soft text-cream">
              <i className="ph-fill ph-user text-lg" />
            </Link>
          </div>
        </div>
        <Link to="/search" className="flex items-center gap-2.5 bg-ink-soft rounded-lg h-[50px] px-3.5 mt-4">
          <i className="ph ph-magnifying-glass text-[19px] text-muted-2" />
          <span className="text-[15.5px] text-muted-2">Search services, products or jobs</span>
        </Link>
        <Link to="/provider" className="flex items-center justify-between bg-brand rounded-lg px-3.5 py-[11px] mt-3">
          <span className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
            <i className="ph-fill ph-arrows-left-right text-[17px]" />
            Switch to selling
          </span>
          <i className="ph-bold ph-arrow-right text-base text-white" />
        </Link>
      </div>

      <div className="px-[22px] pt-5">
        <div className="flex gap-3">
          <Link to="/categories" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-wrench text-2xl text-brand" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">Hire a pro</div>
          </Link>
          <Link to="/shop" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-storefront text-2xl text-brand" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">Shop</div>
          </Link>
          <Link to="/post-job" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-note-pencil text-2xl text-success" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">Post a job</div>
          </Link>
        </div>

        <div className="flex items-center justify-between mt-[26px]">
          <div className="font-display font-bold text-[19px] text-ink">Matched for you</div>
          <Link to="/search" className="text-sm font-semibold text-brand-hover">See all</Link>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <i className="ph-fill ph-sparkle text-sm text-success" />
          <span className="text-[13.5px] text-muted">Based on your last booking and 1.2 km radius</span>
        </div>

        {providers.slice(0, 2).map((p) => (
          <Card key={p.id} to={`/provider/${p.id}`} className="flex gap-3.5 p-3.5 mt-3.5">
            <PlaceholderImage className="w-[76px] h-[76px] flex-none" />
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="font-display font-semibold text-[16.5px] text-ink">{p.name}</span>
                <StarRating rating={p.rating} />
              </div>
              <div className="text-[13px] text-muted-2 mt-0.5">
                {p.category} · {p.distanceKm} km · {p.location}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="font-display font-bold text-[15.5px] text-ink">
                  {formatNaira(p.price)}
                  <span className="text-xs font-normal text-muted-2"> / {p.priceUnit}</span>
                </span>
                {p.verified && <Badge tone="success" icon="shield-check">Verified</Badge>}
              </div>
            </div>
          </Card>
        ))}

        <div className="font-display font-bold text-[19px] text-ink mt-[26px]">More ways to use FindWork</div>
        <div className="grid grid-cols-3 gap-2.5 mt-3.5">
          <Link to="/classifieds" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-tag text-2xl text-brand" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">Classifieds</div>
          </Link>
          <Link to="/courses" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-graduation-cap text-2xl text-success" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">Learn a skill</div>
          </Link>
          <Link to="/rfqs" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-package text-2xl text-brand" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">Bulk orders</div>
          </Link>
        </div>
      </div>
    </Screen>
  )
}
