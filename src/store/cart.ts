import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The cart is the one piece of state that legitimately lives on the device:
 * it is a draft, nothing is owed until checkout, and place_order re-reads
 * every price from the catalog. Everything else comes from the server.
 */
export type CartLine = { productId: string; qty: number }

type CartState = {
  lines: CartLine[]
  add: (productId: string, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const MAX_QTY = 99

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (productId, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === productId)
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l,
              ),
            }
          }
          return { lines: [...s.lines, { productId, qty: Math.min(MAX_QTY, qty) }] }
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l,
          ),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'findwork-cart' },
  ),
)

export function useCartCount() {
  return useCart((s) => s.lines.reduce((sum, l) => sum + l.qty, 0))
}
