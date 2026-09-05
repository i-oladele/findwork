import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { providers, formatNaira } from '../../data/mock'

export function ProviderProfile() {
  const { id } = useParams<{ id: string }>()
  const provider = providers.find((p) => p.id === id) ?? providers[0]
  const firstName = provider.name.split(' ')[0]

  return (
    <Screen>
      <div className="relative h-[180px] bg-[#3A332B]">
        <PlaceholderImage className="absolute inset-0 rounded-none" />
        <div className="relative h-11 flex items-center justify-between px-[22px] font-mono text-xs text-cream">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <div className="relative flex items-center justify-between px-3">
          <Link to="/search" className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink/55 text-cream">
            <i className="ph-bold ph-arrow-left text-xl" />
          </Link>
          <div className="flex gap-2">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink/55 text-cream">
              <i className="ph ph-heart text-xl" />
            </span>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink/55 text-cream">
              <i className="ph ph-share-network text-xl" />
            </span>
          </div>
        </div>
      </div>

      <div className="px-[22px]">
        <div className="flex items-end gap-3.5 -mt-[34px]">
          <div className="flex-none w-[82px] h-[82px] rounded-2xl border-[3px] border-cream overflow-hidden bg-line-soft">
            <PlaceholderImage className="w-full h-full rounded-none" />
          </div>
          <div className="pb-1.5">
            <div className="font-display font-bold text-[22px] tracking-[-0.02em] text-ink">{provider.name}</div>
            <div className="text-[13.5px] text-muted mt-0.5">{provider.category} · {provider.location}, Lagos</div>
          </div>
        </div>

        <div className="flex gap-2 mt-3.5">
          {provider.verified && <Badge tone="success" icon="shield-check">Verified</Badge>}
          {provider.topRated && <Badge tone="warning" icon="medal">Top rated</Badge>}
          {provider.trustScore !== undefined && (
            <span className="inline-flex items-center gap-1.5 bg-white border border-line text-ink rounded-full px-[11px] py-1 text-[11.5px] font-bold">
              Trust {provider.trustScore}
            </span>
          )}
        </div>

        <div className="flex bg-white border border-line rounded-2xl mt-4">
          <div className="flex-1 p-3.5 text-center border-r border-line-soft">
            <div className="font-display font-bold text-[18px] text-ink">{provider.rating}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">{provider.reviews} reviews</div>
          </div>
          <div className="flex-1 p-3.5 text-center border-r border-line-soft">
            <div className="font-display font-bold text-[18px] text-ink">{provider.jobsDone ?? 0}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">jobs done</div>
          </div>
          <div className="flex-1 p-3.5 text-center">
            <div className="font-display font-bold text-[18px] text-ink">{provider.repliesIn ?? '—'}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">replies in</div>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft">
          {provider.bio ?? 'Verified provider on FindWork, taking bookings across Lagos.'}
        </p>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Packages</div>
        {(provider.packages ?? [{ name: `${provider.category} service`, price: provider.price, detail: `Per ${provider.priceUnit}` }]).map(
          (pkg, i) => (
            <div
              key={pkg.name}
              className={`bg-white rounded-2xl p-4 ${i === 0 ? 'border-[1.5px] border-brand' : 'border border-line mt-2.5'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display font-semibold text-[16.5px] text-ink">{pkg.name}</span>
                <span className="font-display font-bold text-[17px] text-ink">{formatNaira(pkg.price)}</span>
              </div>
              <div className="text-[13.5px] text-muted mt-1.5">{pkg.detail}</div>
            </div>
          ),
        )}

        <div className="h-24" />
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] flex gap-3">
        <Link to={`/chat/${provider.id}`} className="flex-none flex items-center justify-center w-14 h-14 border-[1.5px] border-ink rounded-xl text-ink">
          <i className="ph-bold ph-chat-circle-dots text-[22px]" />
        </Link>
        <Link to={`/book/${provider.id}/time`} className="flex-1 flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px]">
          Book {firstName}
        </Link>
      </div>
    </Screen>
  )
}
