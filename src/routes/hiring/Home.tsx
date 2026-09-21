import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { ProviderCard } from '../../components/ui/ProviderCard'
import { QueryState } from '../../components/system/QueryState'
import { useMyProviderProfile, useProfile, useProviders, useUnreadCount } from '../../lib/api'
import { useIsAdmin } from '../../lib/api/admin'
import { firstName } from '../../lib/format'
import { distanceBetween } from '../../lib/distance'

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  const { data: profile } = useProfile()
  const { data: myProvider } = useMyProviderProfile()
  const isAdmin = useIsAdmin()
  const unread = useUnreadCount()
  const providers = useProviders({ limit: 3 })

  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-[22px]">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <div className="min-w-0">
            <div className="text-[13.5px] text-muted-3">
              {greeting()}, {firstName(profile?.full_name)}
            </div>
            <Link to="/settings" className="flex items-center gap-1.5 mt-1 font-display font-semibold text-[16px] text-cream">
              <i className="ph-fill ph-map-pin text-brand text-[15px]" />
              <span className="truncate">{profile?.area ?? profile?.location ?? 'Add your area'}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link to="/notifications" aria-label="Notifications" className="relative inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-bell text-[22px]" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white font-mono text-[10px] flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <Link to="/settings" aria-label="Settings" className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-soft text-cream">
              <i className="ph-fill ph-user text-lg" />
            </Link>
          </div>
        </div>
        <Link to="/search" className="flex items-center gap-2.5 bg-ink-soft rounded-lg h-[50px] px-3.5 mt-4">
          <i className="ph ph-magnifying-glass text-[19px] text-muted-2" />
          <span className="text-[15.5px] text-muted-2">Search tailors, plumbers, cleaners…</span>
        </Link>
        <Link
          to={myProvider ? '/provider' : '/work-profile'}
          className="flex items-center justify-between bg-brand rounded-lg px-3.5 py-[11px] mt-3"
        >
          <span className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
            <i className="ph-fill ph-arrows-left-right text-[17px]" />
            {myProvider ? 'Switch to selling' : 'Start selling on FindWork'}
          </span>
          <i className="ph-bold ph-arrow-right text-base text-white" />
        </Link>
        {isAdmin && (
          <Link to="/admin" className="flex items-center justify-between bg-ink-soft border border-ink-line rounded-lg px-3.5 py-[11px] mt-2.5">
            <span className="flex items-center gap-2 text-[14.5px] font-semibold text-cream">
              <i className="ph-fill ph-user-circle-gear text-[17px] text-warning" />
              Operations console
            </span>
            <i className="ph-bold ph-arrow-right text-base text-muted-2" />
          </Link>
        )}
      </div>

      <div className="px-[22px] pt-5 pb-6">
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
          <div className="font-display font-bold text-[19px] text-ink">Top rated pros</div>
          <Link to="/search" className="text-sm font-semibold text-brand-hover">
            See all
          </Link>
        </div>

        <div className="mt-1">
          <QueryState
            query={providers}
            errorMessage="We could not load providers."
            empty={{ icon: 'ph-users-three', title: 'No providers yet', body: 'Be the first: switch to selling.' }}
          >
            {(list) =>
              list.map((p) => <ProviderCard key={p.id} provider={p} distanceKm={distanceBetween(profile, p)} />)}
          </QueryState>
        </div>

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
        <Link to="/quotes" className="flex items-center justify-between bg-white border border-line rounded-2xl px-4 py-3.5 mt-3">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <i className="ph ph-note-pencil text-lg text-brand" />
            My posted jobs and quotes
          </span>
          <i className="ph-bold ph-caret-right text-sm text-muted-3" />
        </Link>
        <Link to="/saved" className="flex items-center justify-between bg-white border border-line rounded-2xl px-4 py-3.5 mt-2.5">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <i className="ph ph-heart text-lg text-brand" />
            Saved providers
          </span>
          <i className="ph-bold ph-caret-right text-sm text-muted-3" />
        </Link>
      </div>
    </Screen>
  )
}
