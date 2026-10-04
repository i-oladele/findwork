import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { DeliverySpeed, Order, OrderItem, Product, ProductVariant } from '../database.types'

/** Must match the case expression in place_order. */
export const DELIVERY_FEE: Record<DeliverySpeed, number> = { 'same-day': 1800, standard: 1200 }

export type CouponError = 'coupon_invalid' | 'coupon_used_up' | 'coupon_already_used' | 'coupon_not_for_cart' | 'coupon_min_spend'
export type CheckoutQuote = {
  items_total: number; discount: number; delivery_fee: number; seller_count: number; total: number
  coupon: { code: string; error: CouponError | null; discount: number; issuer: string | null } | null
}

export const COUPON_ERRORS: Record<CouponError, string> = {
  coupon_invalid: 'That code is not valid, or it has ended.',
  coupon_used_up: 'That code has been used the maximum number of times.',
  coupon_already_used: 'You have already used that code.',
  coupon_not_for_cart: 'That code is for a different seller\'s goods.',
  coupon_min_spend: 'Your cart is below the minimum spend for that code.',
}

export type CartItem = { product_id: string; variant_id?: string; qty: number }

/**
 * What checkout will charge, priced by the server: delivery is one fee per
 * seller, prices can change after the cart was filled, and a coupon may or
 * may not apply. place_order refuses to charge anything other than the total
 * this returned.
 */
export function useCheckoutQuote(items: CartItem[], deliverySpeed: DeliverySpeed, coupon = '') {
  return useQuery({
    queryKey: keys.commerce.quote(items, deliverySpeed, coupon),
    enabled: items.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<CheckoutQuote> => {
      const { data, error } = await supabase.rpc('checkout_quote', {
        p_items: items,
        p_delivery_speed: deliverySpeed,
        p_coupon_code: coupon || null,
      })
      if (error) throw error
      return data as unknown as CheckoutQuote
    },
  })
}

/** The options of the given products, for the product page and the cart. */
export function useProductVariants(productIds: string[]) {
  const ids = [...new Set(productIds)].sort()
  return useQuery({
    queryKey: keys.commerce.variants(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<ProductVariant[]> => {
      const { data, error } = await supabase.from('product_variants').select('*').in('product_id', ids).order('position')
      if (error) throw error
      return data
    },
  })
}

/** Everything one seller has on sale: their store. */
export function useStoreProducts(sellerId: string | undefined) {
  return useQuery({
    queryKey: keys.commerce.store(sellerId ?? ''),
    enabled: Boolean(sellerId),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('*').eq('seller_id', sellerId!).eq('status', 'live')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type OrderWithItems = Order & { order_items: OrderItem[] }

/** A seller's first photo, else the catalog image FindWork's own goods carry. */
export function productImage(product: Pick<Product, 'photo_urls' | 'image_url'>): string | undefined {
  return product.photo_urls[0] ?? product.image_url ?? undefined
}

/** What is on sale. A seller's own hidden goods are theirs to see, not the shop's. */
export function useProducts() {
  return useQuery({
    queryKey: keys.commerce.products(),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('*').eq('status', 'live').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: keys.commerce.product(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase.from('products').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.commerce.orders(),
    enabled: Boolean(user),
    refetchInterval: (query) => query.state.data?.some((o) => o.status === 'placed' || o.status === 'dispatched') ? 15_000 : false,
    queryFn: async (): Promise<OrderWithItems[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', user!.id)
        .order('placed_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: keys.commerce.order(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (query) => ['placed', 'dispatched'].includes(query.state.data?.status ?? '') ? 15_000 : false,
    queryFn: async (): Promise<OrderWithItems | null> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Prices come from the products table inside place_order, never from the
 * client — the cart only sends product ids and quantities, so a tampered
 * cart cannot change what anything costs.
 */
export function usePlaceOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      items: CartItem[]
      deliverySpeed: DeliverySpeed
      couponCode?: string
      address: string
      phone: string
      /** The quote the customer saw; the order is refused if it no longer matches. */
      expectedTotal: number
      // One order per seller in the cart: they ship and get paid separately.
    }): Promise<string[]> => {
      const { data, error } = await supabase.rpc('place_order', {
        p_items: input.items,
        p_delivery_speed: input.deliverySpeed,
        p_address: input.address,
        p_phone: input.phone,
        p_expected_total: input.expectedTotal,
        p_coupon_code: input.couponCode || null,
      })
      if (error) throw error
      return (data ?? []) as string[]
    },
    onSuccess: () => {
      // Stock changed; this also refreshes any checkout quote.
      qc.invalidateQueries({ queryKey: keys.commerce.products() })
      qc.invalidateQueries({ queryKey: keys.commerce.orders() })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}

/** Full refund, allowed until the order is dispatched. */
export function useCancelOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: (_d, orderId) => {
      qc.invalidateQueries({ queryKey: keys.commerce.orders() })
      qc.invalidateQueries({ queryKey: keys.commerce.order(orderId) })
      qc.invalidateQueries({ queryKey: keys.seller.all })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}

/** The customer says a seller's order arrived, which pays the seller. */
export function useConfirmOrderReceived() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('confirm_order_received', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: (_d, orderId) => {
      qc.invalidateQueries({ queryKey: keys.commerce.orders() })
      qc.invalidateQueries({ queryKey: keys.commerce.order(orderId) })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}
