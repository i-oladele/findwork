import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { products, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const colors = ['#F04E2A', '#0F8A5F', '#2C6BD4', '#EBA313']

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addToCart = useAppStore((s) => s.addToCart)
  const product = products.find((p) => p.id === id) ?? products[0]

  const [qty, setQty] = useState(1)
  const [color, setColor] = useState(0)
  const [added, setAdded] = useState(false)

  function handleAddToCart() {
    addToCart(product.id, qty)
    setAdded(true)
    navigate('/cart')
  }

  return (
    <Screen>
      <div className="relative h-[300px] bg-line-soft">
        <PlaceholderImage className="absolute inset-0 rounded-none w-full h-full" />
        <div className="relative h-11 flex items-center justify-between px-[22px] font-mono text-xs text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <div className="relative flex items-center justify-between px-3">
          <Link to="/shop" className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/90 text-ink">
            <i className="ph-bold ph-arrow-left text-xl" />
          </Link>
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/90 text-ink">
            <i className="ph ph-heart text-xl" />
          </span>
        </div>
        <div className="absolute bottom-3.5 left-0 right-0 flex justify-center gap-1.5">
          <span className="w-[22px] h-1 rounded-full bg-ink" />
          <span className="w-1.5 h-1 rounded-full bg-ink/30" />
          <span className="w-1.5 h-1 rounded-full bg-ink/30" />
        </div>
      </div>

      <div className="px-[22px] pt-5">
        <div className="flex items-start justify-between gap-3.5">
          <h2 className="font-display font-bold text-2xl leading-[1.15] tracking-[-0.02em] text-ink">
            {product.name}
          </h2>
          <span className="font-display font-bold text-2xl text-ink whitespace-nowrap">{formatNaira(product.price)}</span>
        </div>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <PlaceholderImage className="w-11 h-11 flex-none" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-ink">{product.vendor}</span>
              <i className="ph-fill ph-shield-check text-sm text-success" />
            </div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">4.8 · 1,240 orders · Lagos Island</div>
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Colour</div>
        <div className="flex gap-2.5">
          {colors.map((c, i) => (
            <button
              key={c}
              onClick={() => setColor(i)}
              className="w-11 h-11 rounded-lg"
              style={{ background: c, border: color === i ? '2px solid #17130E' : undefined }}
            />
          ))}
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Quantity</div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="inline-flex items-center justify-center w-11 h-11 bg-white border border-line rounded-lg text-ink"
          >
            <i className="ph-bold ph-minus text-base" />
          </button>
          <span className="font-display font-bold text-[19px] text-ink">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            className="inline-flex items-center justify-center w-11 h-11 bg-white border border-line rounded-lg text-ink"
          >
            <i className="ph-bold ph-plus text-base" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-5">
          <i className="ph ph-truck text-xl text-success" />
          <div>
            <div className="text-[14.5px] font-semibold text-ink">Delivery ₦1,200 to Yaba</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Arrives tomorrow if ordered before 4pm</div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5 flex gap-3">
        <Link to="/messages" className="flex-none flex items-center justify-center w-14 h-14 border-[1.5px] border-ink rounded-xl text-ink">
          <i className="ph-bold ph-chat-circle-dots text-[22px]" />
        </Link>
        <button
          onClick={handleAddToCart}
          className="flex-1 flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px]"
        >
          {added ? 'Added ✓' : 'Add to cart'}
        </button>
      </div>
    </Screen>
  )
}
