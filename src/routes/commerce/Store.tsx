import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import { productImage, useProvider, useSocialFeed, useStoreProducts } from '../../lib/api'
import { Post } from '../social/Feed'
import { formatNaira } from '../../lib/format'

/** One seller's shopfront: who they are, and everything they have on sale. */
export function Store() {
  const { sellerId } = useParams<{ sellerId: string }>()
  const seller = useProvider(sellerId)
  const products = useStoreProducts(sellerId)
  const posts = useSocialFeed(null, sellerId ?? null)
  const p = seller.data

  return (
    <Screen>
      <PageHeader title={p?.business_name ?? 'Store'} back="/shop" />
      <div className="px-[22px] pb-8">
        {p && (
          <div className="flex gap-3.5 bg-white border border-line rounded-2xl p-4 mt-4">
            <PlaceholderImage src={p.photo_urls?.[0]} className="w-16 h-16 flex-none" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-[17px] text-ink truncate">{p.business_name}</div>
              <div className="text-[13px] text-muted-2 mt-0.5 truncate">{[p.area, p.location].filter(Boolean).join(' · ')}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.verified && <Badge tone="success" icon="shield-check">Verified</Badge>}
                <Badge tone={p.trust_score >= 60 ? 'success' : 'neutral'}>Trust {p.trust_score}</Badge>
                {p.reviews > 0 && <Badge tone="neutral" icon="star">{Number(p.rating).toFixed(1)} · {p.reviews}</Badge>}
              </div>
              <div className="flex gap-4 mt-2 text-[14px] font-semibold text-brand-hover">
                <Link to={`/provider/${p.id}`} className="min-h-11 flex items-center">Profile and services</Link>
                <Link to={`/chat/with/${p.id}`} className="min-h-11 flex items-center">Message</Link>
              </div>
            </div>
          </div>
        )}
        <SectionLabel className="mt-5 mb-2.5">On sale</SectionLabel>
        <QueryState query={products} errorMessage="We could not load this store." empty={{ icon: 'ph-storefront', title: 'Nothing on sale right now' }}>
          {(rows) => (
            <div className="grid grid-cols-2 gap-3">
              {rows.map((item) => (
                <Link key={item.id} to={`/product/${item.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
                  <PlaceholderImage src={productImage(item)} className="w-full h-[120px] rounded-none" />
                  <div className="p-3">
                    <div className="text-[14.5px] font-semibold text-ink leading-[1.3] line-clamp-2">{item.name}</div>
                    <div className="font-display font-bold text-[15px] text-ink mt-1.5">{formatNaira(item.price)}</div>
                    {item.stock !== null && item.stock <= 0 && <div className="text-[12px] text-muted-2 mt-0.5">Sold out</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </QueryState>
        {(posts.data?.length ?? 0) > 0 && (
          <>
            <SectionLabel className="mt-6 mb-2.5">Stories and reels</SectionLabel>
            {posts.data!.map((post) => <Post key={post.id} post={post} />)}
          </>
        )}
      </div>
    </Screen>
  )
}
