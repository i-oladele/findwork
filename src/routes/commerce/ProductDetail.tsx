import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { productImage, useProduct } from '../../lib/api'
import { useAuth } from '../../lib/authContext'
import { useCart } from '../../store/cart'
import { formatNaira } from '../../lib/format'

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: product, isLoading } = useProduct(id)
  const add = useCart((s) => s.add)
  const inCart = useCart((s) => s.lines.find((l) => l.productId === id)?.qty ?? 0)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [photo, setPhoto] = useState(0)

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

  const mine = Boolean(user && product.seller_id === user.id)
  const onSale = product.status === 'live'
  // Stock already in the cart counts: the server checks the cart as a whole.
  const available = product.stock === null ? 99 : Math.max(0, Math.min(99, product.stock - inCart))
  const soldOut = product.stock !== null && product.stock <= inCart
  const photos = product.photo_urls.length > 0 ? product.photo_urls : [productImage(product)]

  return (
    <Screen>
      <div className="relative h-[280px] bg-line-soft">
        <PlaceholderImage src={photos[photo] ?? photos[0]} className="absolute inset-0 rounded-none w-full h-full" />
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

        {photos.length > 1 && (
          <div className="flex gap-2 mt-4 overflow-x-auto">
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => setPhoto(i)}
                className={`flex-none rounded-lg ${i === photo ? 'ring-2 ring-brand' : ''}`}
              >
                <PlaceholderImage src={url} className="w-14 h-14" />
              </button>
            ))}
          </div>
        )}

        {product.description && (
          <p className="mt-4 text-[15px] leading-[1.55] text-text-soft whitespace-pre-line">{product.description}</p>
        )}

        {product.seller_id ? (
          <Link
            to={`/provider/${product.seller_id}`}
            className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4"
          >
            <i className="ph-fill ph-storefront text-2xl text-brand" />
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">{product.vendor}</div>
              <div className="text-[12.5px] text-muted-2 mt-0.5">
                Your money is held until you confirm it arrived
              </div>
            </div>
            <i className="ph ph-caret-right text-muted-2" />
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
            <i className="ph-fill ph-storefront text-2xl text-brand" />
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">{product.vendor}</div>
              <div className="text-[12.5px] text-muted-2 mt-0.5">Sold and delivered through FindWork</div>
            </div>
          </div>
        )}

        {product.stock !== null && product.stock > 0 && product.stock <= 5 && (
          <div className="text-[13.5px] font-semibold text-warning-text mt-3">Only {product.stock} left</div>
        )}

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
            onClick={() => setQty((q) => Math.min(Math.max(available, 1), q + 1))}
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
        {mine ? (
          <Link
            to={`/provider/products/${product.id}/edit`}
            className="flex-1 flex items-center justify-center h-14 border-[1.5px] border-ink rounded-xl text-ink font-semibold text-[17px]"
          >
            {onSale ? 'Your product · Edit' : 'Hidden from the shop · Edit'}
          </Link>
        ) : !onSale || (soldOut && inCart === 0) ? (
          <div className="flex-1 flex items-center justify-center h-14 bg-line-soft rounded-xl text-muted font-semibold text-[17px]">
            {onSale ? 'Sold out' : 'No longer sold'}
          </div>
        ) : (
          <>
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
                add(product.id, Math.min(qty, available))
                setAdded(true)
                setQty(1)
              }}
              disabled={available === 0}
              className="flex-1 flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px] disabled:opacity-50"
            >
              {available === 0
                ? 'All in your cart'
                : added
                  ? 'Added ✓ — add more'
                  : `Add to cart · ${formatNaira(product.price * Math.min(qty, available))}`}
            </button>
          </>
        )}
      </div>
    </Screen>
  )
}
