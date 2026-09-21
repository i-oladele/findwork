import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ReportButton } from '../../components/ui/ReportButton'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useClassified, useDeleteClassified } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { agoPhrase, formatNaira } from '../../lib/format'

export function ClassifiedDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: ad, isLoading } = useClassified(id)
  const remove = useDeleteClassified()
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState(0)

  if (isLoading) return <FullScreenLoader />
  if (!ad) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px]">
          <BackButton fallback="/classifieds" />
          <EmptyState icon="ph-tag" title="Listing not found" body="It may have been sold or taken down." />
        </div>
      </Screen>
    )
  }

  const isMine = ad.seller_id === user?.id

  async function doDelete() {
    if (!window.confirm('Take this listing down?')) return
    setError(null)
    try {
      await remove.mutateAsync(ad!.id)
      navigate('/classifieds', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <div className="relative h-[260px] bg-line-soft">
        <PlaceholderImage src={ad.photo_urls[photo]} className="absolute inset-0 rounded-none w-full h-full" />
        <div className="relative">
          <StatusBar />
          <span className="inline-flex ml-3 rounded-full bg-white/90 pl-2.5">
            <BackButton fallback="/classifieds" />
          </span>
        </div>
        {ad.photo_urls.length > 1 && (
          <div className="absolute bottom-3.5 left-0 right-0 flex justify-center gap-1.5">
            {ad.photo_urls.map((url, i) => (
              <button
                key={url}
                aria-label={`Photo ${i + 1}`}
                onClick={() => setPhoto(i)}
                className={`h-1.5 rounded-full ${i === photo ? 'w-[22px] bg-ink' : 'w-1.5 bg-ink/30'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-[22px] pt-5 pb-6">
        <div className="flex items-start justify-between gap-3.5">
          <h2 className="font-display font-bold text-2xl leading-[1.15] tracking-[-0.02em] text-ink">{ad.title}</h2>
          <span className="font-display font-bold text-2xl text-ink whitespace-nowrap">
            {formatNaira(ad.price)}
            {ad.category === 'Rentals' && <span className="text-sm font-normal text-muted-2">/yr</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[13.5px] text-muted">
          <i className="ph ph-map-pin text-sm text-muted-2" />
          {ad.location}
          <span className="w-1 h-1 rounded-full bg-line" />
          Posted {agoPhrase(ad.created_at)}
        </div>

        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft whitespace-pre-wrap">{ad.description}</p>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <PlaceholderImage shape="circle" src={ad.seller?.avatar_url ?? undefined} className="w-11 h-11 flex-none" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-ink truncate">{isMine ? 'You' : ad.seller?.full_name || 'FindWork user'}</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Seller on FindWork</div>
          </div>
        </div>

        <SectionLabel className="mt-5 mb-2.5">Meet safely</SectionLabel>
        <div className="bg-white border border-line rounded-2xl p-4 space-y-2.5">
          <Tip icon="ph-users-three" text="Meet in a public place during the day, and take someone with you." />
          <Tip icon="ph-eye" text="See the item and test it before you pay anything." />
          <Tip icon="ph-hand-coins" text="FindWork escrow does not cover classifieds — never send money in advance." />
        </div>

        {error && <Alert className="mt-4">{error}</Alert>}
        {!isMine && <ReportButton targetType="classified" targetId={ad.id} label="Report this listing" className="mt-5" />}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))]">
        {isMine ? (
          <button
            onClick={doDelete}
            disabled={remove.isPending}
            className="flex items-center justify-center w-full h-14 border-[1.5px] border-ink rounded-xl font-semibold text-[16px] text-ink disabled:opacity-50"
          >
            Take this listing down
          </button>
        ) : (
          <Link
            to={`/chat/with/${ad.seller_id}`}
            className="flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px]"
          >
            Message seller
          </Link>
        )}
      </div>
    </Screen>
  )
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <i className={`ph ${icon} text-lg text-brand relative top-0.5`} />
      <span className="text-[13.5px] leading-[1.45] text-text-soft">{text}</span>
    </div>
  )
}
