import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Alert } from '../../components/ui/Alert'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { productImage, useMyProducts, useSetProductStatus } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'

export function Products() {
  return <RequireProvider>{() => <ProductList />}</RequireProvider>
}

function stockLabel(stock: number | null) {
  if (stock === null) return 'Made to order'
  if (stock === 0) return 'Sold out'
  return `${stock} in stock`
}

function ProductList() {
  const products = useMyProducts()
  const setStatus = useSetProductStatus()
  const [error, setError] = useState<string | null>(null)

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">My products</h2>
          <Link
            to="/provider/products/new"
            aria-label="Add a product"
            className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white"
          >
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>

        <Link to="/provider/orders" className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <i className="ph-fill ph-package text-xl text-brand" />
          <div className="flex-1 text-sm leading-[1.45] text-text-soft">
            Orders for your goods, and what to send next
          </div>
          <i className="ph ph-caret-right text-muted-2" />
        </Link>
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState
          query={products}
          errorMessage="We could not load your products."
          empty={{
            icon: 'ph-storefront',
            title: 'Nothing for sale yet',
            body: 'List goods you sell and they appear in the Shop. The money is held until the customer says it arrived, then paid to you less your plan’s fee.',
            action: (
              <Link to="/provider/products/new" className="text-[15px] font-semibold text-brand-hover">
                Add a product
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map((p) => {
              const live = p.status === 'live'
              return (
                <div key={p.id} className={`bg-white border border-line rounded-2xl overflow-hidden mt-4 ${live ? '' : 'opacity-[.72]'}`}>
                  <Link to={`/product/${p.id}`} className="flex gap-3.5 p-3.5">
                    <PlaceholderImage src={productImage(p)} className="w-[60px] h-[60px] flex-none" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display font-semibold text-base text-ink truncate">{p.name}</span>
                        <span className="font-display font-bold text-base text-ink whitespace-nowrap">{formatNaira(p.price)}</span>
                      </div>
                      {p.variant && <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">{p.variant}</div>}
                      <div className="flex items-center gap-2 mt-2">
                        {live ? (
                          <span className="inline-flex items-center gap-1.5 bg-success-bg text-success-text rounded-full px-2.5 py-1 text-[11px] font-bold">
                            <i className="ph-fill ph-check-circle" />
                            In the shop
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-cream text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">
                            <i className="ph-fill ph-eye-slash" />
                            Hidden
                          </span>
                        )}
                        <span className={`text-[11.5px] ${p.stock === 0 ? 'text-danger font-semibold' : 'text-muted-2'}`}>
                          {stockLabel(p.stock)}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex border-t border-line-soft">
                    <Link
                      to={`/provider/products/${p.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-ink border-r border-line-soft"
                    >
                      <i className="ph ph-pencil-simple text-base" />
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        setError(null)
                        setStatus.mutate(
                          { id: p.id, status: live ? 'hidden' : 'live' },
                          { onError: (e) => setError(friendlyError(e)) },
                        )
                      }}
                      disabled={setStatus.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-muted"
                    >
                      <i className={`ph ${live ? 'ph-eye-slash' : 'ph-eye'} text-base`} />
                      {live ? 'Hide' : 'Show in shop'}
                    </button>
                  </div>
                </div>
              )
            })
          }
        </QueryState>
      </div>
    </Screen>
  )
}
