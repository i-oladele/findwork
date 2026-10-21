import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { EmptyState, ListSkeleton } from '../../components/system/States'
import { productImage, useProducts, useProductVariants } from '../../lib/api'
import { useCart } from '../../store/cart'
import { formatNaira } from '../../lib/format'
import { useT } from '../../lib/i18n'

export function Cart() {
  const t = useT()
  const lines = useCart((s) => s.lines)
  const setQty = useCart((s) => s.setQty)
  const remove = useCart((s) => s.remove)
  const { data: products, isLoading } = useProducts()

  const optionIds = lines.filter((l) => l.variantId).map((l) => l.productId)
  const { data: variants, isLoading: variantsLoading } = useProductVariants(optionIds)
  const settled = Boolean(products) && (optionIds.length === 0 || Boolean(variants))

  const items = lines.flatMap((line) => {
    const product = products?.find((p) => p.id === line.productId)
    const option = line.variantId ? variants?.find((v) => v.id === line.variantId) : undefined
    if (!product || (line.variantId && !option)) return []
    return [{ ...product, key: `${product.id}:${line.variantId ?? ''}`, variantId: line.variantId ?? null, option: option?.name ?? null, price: option?.price ?? product.price, qty: line.qty }]
  })
  // Lines for products or options the shop no longer sells — shown so they can be removed.
  const gone = settled
    ? lines.filter((l) => !products!.some((p) => p.id === l.productId) || (l.variantId && !variants?.some((v) => v.id === l.variantId)))
    : []
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const count = items.reduce((sum, it) => sum + it.qty, 0)

  return (
    <Screen>
      <PageHeader title={`Your cart · ${count} item${count === 1 ? '' : 's'}`} back="/shop" />
      <div className="px-[22px] pb-6">
        {(isLoading || variantsLoading) && lines.length > 0 && (
          <div className="mt-5">
            <ListSkeleton rows={lines.length} />
          </div>
        )}

        {lines.length === 0 && (
          <EmptyState
            icon="ph-shopping-cart"
            title={t('Your cart is empty')}
            action={
              <Link to="/shop" className="text-[15px] font-semibold text-brand-hover">
                {t('Browse the shop')}
              </Link>
            }
          />
        )}

        {gone.length > 0 && (
          <Alert className="mt-4">
            {gone.length} item{gone.length === 1 ? ' is' : 's are'} no longer sold.{' '}
            <button className="font-semibold underline" onClick={() => gone.forEach((l) => remove(l.productId, l.variantId))}>
              {t('Remove')}
            </button>
          </Alert>
        )}

        {items.length > 0 && (
          <div className="bg-white border border-line rounded-2xl overflow-hidden mt-4">
            {items.map((it, i) => (
              <div key={it.key} className={`flex gap-3.5 p-3.5 ${i < items.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <PlaceholderImage src={productImage(it)} className="w-[60px] h-[60px] flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-ink leading-[1.3]">{it.name}</div>
                  <div className="text-[12.5px] text-muted-2 mt-1">{it.option ? `${it.option} · ` : ''}{it.vendor}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-display font-bold text-[15.5px] text-ink">{formatNaira(it.price * it.qty)}</span>
                    <span className="flex items-center gap-3">
                      <button
                        aria-label={it.qty === 1 ? 'Remove' : 'Fewer'}
                        onClick={() => (it.qty === 1 ? remove(it.id, it.variantId) : setQty(it.id, it.qty - 1, it.variantId))}
                        className="w-8 h-8 flex items-center justify-center"
                      >
                        <i className={`ph ${it.qty === 1 ? 'ph-trash' : 'ph-minus'} text-[15px] text-muted`} />
                      </button>
                      <span className="text-[14.5px] font-semibold text-ink">{it.qty}</span>
                      <button aria-label={t('More')} onClick={() => setQty(it.id, it.qty + 1, it.variantId)} className="w-8 h-8 flex items-center justify-center">
                        <i className="ph ph-plus text-[15px] text-muted" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[15px] text-text-soft">Subtotal · {count} items</span>
            <span className="font-display font-bold text-2xl text-ink">{formatNaira(subtotal)}</span>
          </div>
          <Button to="/checkout" disabled={gone.length > 0} className="w-full">
            {t('Checkout')}
          </Button>
        </div>
      )}
    </Screen>
  )
}
