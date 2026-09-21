import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { StarRating } from '../../components/ui/StarRating'
import { ReportButton } from '../../components/ui/ReportButton'
import { SaveProviderButton } from '../../components/ui/SaveProviderButton'
import { EmptyState, ErrorState, ListSkeleton } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useProfile, useProvider, useProviderPackages, useProviderReviews } from '../../lib/api'
import { formatDate, formatNaira } from '../../lib/format'
import { describeDistance, distanceBetween } from '../../lib/distance'

export function ProviderProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const provider = useProvider(id)
  const { data: packages } = useProviderPackages(id)
  const { data: reviews } = useProviderReviews(id)
  const { data: me } = useProfile()
  const [chosen, setChosen] = useState<string | null>(null)

  if (provider.isLoading) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px] pt-6">
          <ListSkeleton rows={4} />
        </div>
      </Screen>
    )
  }
  if (provider.isError || !provider.data) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px]">
          <BackButton fallback="/search" />
          {provider.isError ? (
            <ErrorState message="We could not load this provider." onRetry={() => provider.refetch()} />
          ) : (
            <EmptyState icon="ph-user-circle-minus" title="Provider not found" body="They may have closed their account." />
          )}
        </div>
      </Screen>
    )
  }

  const p = provider.data
  const isMine = user?.id === p.id
  const livePackages = (packages ?? []).filter((pkg) => pkg.status === 'live')
  const selected = chosen ?? livePackages[0]?.id ?? null
  const canBook = !isMine && p.taking_bookings
  const distance = distanceBetween(me, p)

  function book() {
    navigate(`/book/${p.id}/time${selected ? `?package=${selected}` : ''}`)
  }

  return (
    <Screen>
      <div className="relative h-[150px] bg-[#3A332B]">
        <PlaceholderImage src={p.photo_urls[0]} className="absolute inset-0 rounded-none w-full h-full" />
        <div className="relative">
          <StatusBar tone="light" />
          <div className="flex items-center justify-between px-3">
            <span className="inline-flex rounded-full bg-ink/55 pl-2.5">
              <BackButton fallback="/search" tone="light" />
            </span>
            {!isMine && <SaveProviderButton providerId={p.id} tone="light" />}
          </div>
        </div>
      </div>

      <div className="px-[22px] pb-6">
        <div className="flex items-end gap-3.5 -mt-[34px]">
          <div className="flex-none w-[82px] h-[82px] rounded-2xl border-[3px] border-cream overflow-hidden bg-line-soft">
            <PlaceholderImage src={p.photo_urls[0]} className="w-full h-full rounded-none" />
          </div>
          <div className="pb-1.5 min-w-0">
            <div className="font-display font-bold text-[22px] tracking-[-0.02em] text-ink truncate">{p.business_name}</div>
            <div className="text-[13.5px] text-muted mt-0.5">
              {p.category} · {p.area ?? p.location}
              {describeDistance(distance) && ` · ${describeDistance(distance)}`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3.5">
          {p.verified ? (
            <Badge tone="success" icon="shield-check">
              Verified
            </Badge>
          ) : (
            <Badge tone="neutral">Not yet verified</Badge>
          )}
          {p.plan !== 'free' && (
            <Badge tone="warning" icon="medal">
              Pro
            </Badge>
          )}
          {!p.taking_bookings && <Badge tone="danger">Not taking bookings</Badge>}
        </div>

        <div className="flex bg-white border border-line rounded-2xl mt-4">
          <div className="flex-1 p-3.5 text-center border-r border-line-soft">
            <div className="font-display font-bold text-[18px] text-ink">{p.reviews > 0 ? Number(p.rating).toFixed(1) : '—'}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">
              {p.reviews} review{p.reviews === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex-1 p-3.5 text-center border-r border-line-soft">
            <div className="font-display font-bold text-[18px] text-ink">{p.jobs_done}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">jobs done</div>
          </div>
          <div className="flex-1 p-3.5 text-center">
            <div className="font-display font-bold text-[18px] text-ink">{formatDate(p.created_at).split(' ').slice(1).join(' ')}</div>
            <div className="text-[11.5px] text-muted-2 mt-0.5">on FindWork since</div>
          </div>
        </div>

        {p.bio && <p className="mt-4 text-[15px] leading-[1.6] text-text-soft">{p.bio}</p>}

        {p.photo_urls.length > 0 && (
          <>
            <SectionLabel className="mt-5 mb-2.5">Their work</SectionLabel>
            <div className="flex gap-2.5 overflow-x-auto -mx-[22px] px-[22px] pb-1">
              {p.photo_urls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="flex-none w-[132px] h-[132px] object-cover rounded-xl bg-line-soft"
                />
              ))}
            </div>
          </>
        )}

        <SectionLabel className="mt-5 mb-2.5">Services</SectionLabel>
        {livePackages.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display font-semibold text-[16.5px] text-ink">{p.category} service</span>
              <span className="font-display font-bold text-[17px] text-ink">{formatNaira(p.price)}</span>
            </div>
            <div className="text-[13.5px] text-muted mt-1.5">Per {p.price_unit}</div>
          </div>
        ) : (
          livePackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setChosen(pkg.id)}
              className={`w-full text-left bg-white rounded-2xl p-4 mt-2.5 first:mt-0 ${
                selected === pkg.id ? 'border-[1.5px] border-brand' : 'border border-line'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display font-semibold text-[16.5px] text-ink">{pkg.name}</span>
                <span className="font-display font-bold text-[17px] text-ink whitespace-nowrap">{formatNaira(pkg.price)}</span>
              </div>
              {pkg.detail && <div className="text-[13.5px] text-muted mt-1.5">{pkg.detail}</div>}
            </button>
          ))
        )}

        <SectionLabel className="mt-6 mb-2.5">Reviews</SectionLabel>
        {!reviews?.length ? (
          <p className="text-[14px] text-muted">No reviews yet. Reviews come only from customers who booked and paid.</p>
        ) : (
          <div className="space-y-2.5">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14.5px] font-semibold text-ink">{r.reviewer?.full_name || 'A customer'}</span>
                  <StarRating rating={r.rating} />
                </div>
                {r.body && <p className="mt-2 text-[14px] leading-[1.5] text-text-soft">{r.body}</p>}
                <div className="text-[12px] text-muted-2 mt-2">{formatDate(r.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {!isMine && <ReportButton targetType="profile" targetId={p.id} label="Report this provider" className="mt-6" />}
        <div className="h-20" />
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] flex gap-3">
        {isMine ? (
          <Link
            to="/provider/services"
            className="flex-1 flex items-center justify-center h-14 border-[1.5px] border-ink rounded-xl font-semibold text-[17px] text-ink"
          >
            This is you — manage services
          </Link>
        ) : (
          <>
            <Link
              to={`/chat/with/${p.id}`}
              aria-label={`Message ${p.business_name}`}
              className="flex-none flex items-center justify-center w-14 h-14 border-[1.5px] border-ink rounded-xl text-ink"
            >
              <i className="ph-bold ph-chat-circle-dots text-[22px]" />
            </Link>
            <button
              onClick={book}
              disabled={!canBook}
              className="flex-1 flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px] disabled:opacity-50"
            >
              {p.taking_bookings ? 'Book now' : 'Not taking bookings'}
            </button>
          </>
        )}
      </div>
    </Screen>
  )
}
