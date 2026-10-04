import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The cart is the one piece of state that legitimately lives on the device:
 * it is a draft, nothing is owed until checkout, and place_order re-reads
 * every price from the catalog. Everything else comes from the server.
 *
 * A product sold in options (sizes, colours) is in the cart once per option.
 */
export type CartLine = { productId: string; variantId?: string | null; qty: number }

type CartState = {
  lines: CartLine[]
  add: (productId: string, qty?: number, variantId?: string | null) => void
  setQty: (productId: string, qty: number, variantId?: string | null) => void
  remove: (productId: string, variantId?: string | null) => void
  clear: () => void
}

const MAX_QTY = 99

const same = (line: CartLine, productId: string, variantId?: string | null) =>
  line.productId === productId && (line.variantId ?? null) === (variantId ?? null)

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (productId, qty = 1, variantId = null) =>
        set((s) => {
          if (s.lines.some((l) => same(l, productId, variantId))) {
            return {
              lines: s.lines.map((l) => (same(l, productId, variantId) ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l)),
            }
          }
          return { lines: [...s.lines, { productId, ...(variantId ? { variantId } : {}), qty: Math.min(MAX_QTY, qty) }] }
        }),
      setQty: (productId, qty, variantId = null) =>
        set((s) => ({
          lines: s.lines.map((l) => (same(l, productId, variantId) ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)),
        })),
      remove: (productId, variantId = null) => set((s) => ({ lines: s.lines.filter((l) => !same(l, productId, variantId)) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'findwork-cart' },
  ),
)

export function useCartCount() {
  return useCart((s) => s.lines.reduce((sum, l) => sum + l.qty, 0))
}

/** What checkout sends: the option is named only when there is one. */
export function cartItems(lines: CartLine[]): { product_id: string; variant_id?: string; qty: number }[] {
  return lines.map((l) => ({ product_id: l.productId, ...(l.variantId ? { variant_id: l.variantId } : {}), qty: l.qty }))
}
