import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useProduct } from '../../lib/api'
import { useCart } from '../../store/cart'
import { formatNaira } from '../../lib/format'

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading } = useProduct(id)
  const add = useCart((s) => s.add)
  const inCart = useCart((s) => s.lines.find((l) => l.productId === id)?.qty ?? 0)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  if (isLoading) return <FullScreenLoader />
  if (!product) {
    return (
      <Screen>
        <StatusBar />
        <div className="px-[22px]">
          <BackButton fallback="/shop" />
          <EmptyState icon="ph-package" title="Product not found" body="It may no longer be sold." />
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="relative h-[280px] bg-line-soft">
        <PlaceholderImage src={product.image_url ?? undefined} className="absolute inset-0 rounded-none w-full h-full" />
        <div className="relative">
          <StatusBar />
          <span className="inline-flex ml-3 rounded-full bg-white/90 pl-2.5">
            <BackButton fallback="/shop" />
          </span>
        </div>
      </div>

      <div className="px-[22px] pt-5 pb-6">
        <div className="flex items-start justify-between gap-3.5">
          <h2 className="font-display font-bold text-2xl leading-[1.15] tracking-[-0.02em] text-ink">{product.name}</h2>
          <span className="font-display font-bold text-2xl text-ink whitespace-nowrap">{formatNaira(product.price)}</span>
        </div>
        {product.variant && <div className="text-[14px] text-muted mt-1.5">{product.variant}</div>}

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <i className="ph-fill ph-storefront text-2xl text-brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-ink">{product.vendor}</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Sold and delivered through FindWork</div>
          </div>
        </div>

        <SectionLabel className="mt-5 mb-2.5">Quantity</SectionLabel>
        <div className="flex items-center gap-4">
          <button
            aria-label="Fewer"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="inline-flex items-center justify-center w-11 h-11 bg-white border border-line rounded-lg text-ink"
          >
            <i className="ph-bold ph-minus text-base" />
          </button>
          <span className="font-display font-bold text-[19px] text-ink w-6 text-center">{qty}</span>
          <button
            aria-label="More"
            onClick={() => setQty((q) => Math.min(99, q + 1))}
            className="inline-flex items-center justify-center w-11 h-11 bg-white border border-line rounded-lg text-ink"
          >
            <i className="ph-bold ph-plus text-base" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-5">
          <i className="ph ph-truck text-xl text-success" />
          <div>
            <div className="text-[14.5px] font-semibold text-ink">Delivery from {formatNaira(1200)}</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Choose standard or same-day at checkout</div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] flex gap-3">
        {added || inCart > 0 ? (
          <Link
            to="/cart"
            className="flex-none flex items-center justify-center px-5 h-14 border-[1.5px] border-ink rounded-xl text-ink font-semibold"
          >
            Cart ({inCart})
          </Link>
        ) : null}
        <button
          onClick={() => {
            add(product.id, qty)
            setAdded(true)
            setQty(1)
          }}
          className="flex-1 flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px]"
        >
          {added ? 'Added ✓ — add more' : `Add to cart · ${formatNaira(product.price * qty)}`}
        </button>
      </div>
    </Screen>
  )
}
