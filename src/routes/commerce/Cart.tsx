import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { products, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Cart() {
  const cart = useAppStore((s) => s.cart)
  const setCartQty = useAppStore((s) => s.setCartQty)
  const removeFromCart = useAppStore((s) => s.removeFromCart)

  const items = cart
    .map((line) => {
      const product = products.find((p) => p.id === line.productId)
      return product ? { ...product, qty: line.qty } : null
    })
    .filter((it): it is NonNullable<typeof it> => it !== null)

  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const count = items.reduce((sum, it) => sum + it.qty, 0)
  const byVendor = Array.from(new Set(items.map((it) => it.vendor)))

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/shop" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Your cart · {count} item{count === 1 ? '' : 's'}</span>
        </div>

        {items.length === 0 && (
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center">
            <p className="text-sm text-muted">Your cart is empty.</p>
            <Link to="/shop" className="inline-block mt-3 text-sm font-semibold text-brand-hover">
              Browse the shop
            </Link>
          </div>
        )}

        {byVendor.map((vendor) => (
          <div key={vendor}>
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[18px] mb-2.5">
              {vendor}
            </div>
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              {items
                .filter((it) => it.vendor === vendor)
                .map((it, i, arr) => (
                  <div
                    key={it.id}
                    className={`flex gap-3.5 p-3.5 ${i < arr.length - 1 ? 'border-b border-line-soft' : ''}`}
                  >
                    <PlaceholderImage className="w-[60px] h-[60px] flex-none" />
                    <div className="flex-1">
                      <div className="text-[15px] font-semibold text-ink leading-[1.3]">{it.name}</div>
                      {it.variant && <div className="text-[12.5px] text-muted-2 mt-1">{it.variant}</div>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-display font-bold text-[15.5px] text-ink">{formatNaira(it.price)}</span>
                        <span className="flex items-center gap-3">
                          <button onClick={() => (it.qty === 1 ? removeFromCart(it.id) : setCartQty(it.id, it.qty - 1))}>
                            <i className={`ph ${it.qty === 1 ? 'ph-trash' : 'ph-minus'} text-[15px] text-muted`} />
                          </button>
                          <span className="text-[14.5px] font-semibold text-ink">{it.qty}</span>
                          <button onClick={() => setCartQty(it.id, it.qty + 1)}>
                            <i className="ph ph-plus text-[15px] text-muted" />
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-dashed border-[#C9A99E] rounded-lg h-[52px] px-3.5 mt-4">
            <i className="ph ph-ticket text-lg text-brand" />
            <span className="flex-1 text-[15px] text-muted-2">Add a coupon code</span>
            <span className="text-[14.5px] font-semibold text-brand-hover">Apply</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[15px] text-text-soft">Subtotal · {count} items</span>
            <span className="font-display font-bold text-2xl text-ink">{formatNaira(subtotal)}</span>
          </div>
          <Button to="/checkout">Checkout</Button>
        </div>
      )}
    </Screen>
  )
}
