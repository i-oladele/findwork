import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Coupon, Product } from '../database.types'
import type { OrderWithItems } from './commerce'

/**
 * A provider selling goods: their products and the orders for them. Money
 * for an order is held in escrow at checkout and released to the seller when
 * the customer confirms it arrived (or a week after dispatch), less the
 * seller's plan commission.
 */

export type SellerOrder = OrderWithItems & { customer: { full_name: string } | null }

/** The signed-in seller's goods in every status, including hidden ones. */
export function useMyProducts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.seller.products(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user!.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type ProductInput = {
  name: string
  price: number
  variant: string | null
  description: string | null
  /** null: made to order, never runs out. */
  stock: number | null
  status: 'live' | 'hidden'
  photo_urls: string[]
}

export function useSaveProduct() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...fields }: ProductInput & { id?: string }) => {
      const { error } = id
        ? await supabase.from('products').update(fields).eq('id', id)
        : // The shop name is filled in from the business profile by the database.
          await supabase.from('products').insert({ ...fields, seller_id: user!.id, vendor: '' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.seller.products() })
      qc.invalidateQueries({ queryKey: keys.commerce.products() })
    },
  })
}

/** Hiding takes a product out of the shop; sold products cannot be deleted. */
export function useSetProductStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'live' | 'hidden' }) => {
      const { error } = await supabase.from('products').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.seller.products() })
      qc.invalidateQueries({ queryKey: keys.commerce.products() })
    },
  })
}

/** Orders for the seller's goods: every open one, and the most recent closed ones. */
export function useSellerOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.seller.orders(),
    enabled: Boolean(user),
    queryFn: async (): Promise<SellerOrder[]> => {
      const select = '*, order_items(*), customer:profiles!orders_customer_id_fkey(full_name)'
      const [open, closed] = await Promise.all([
        supabase
          .from('orders')
          .select(select)
          .eq('seller_id', user!.id)
          .in('status', ['placed', 'dispatched'])
          .order('placed_at'),
        supabase
          .from('orders')
          .select(select)
          .eq('seller_id', user!.id)
          .in('status', ['delivered', 'returned', 'cancelled'])
          .order('updated_at', { ascending: false })
          .limit(50),
      ])
      if (open.error) throw open.error
      if (closed.error) throw closed.error
      return [...open.data, ...closed.data] as unknown as SellerOrder[]
    },
  })
}

export function useDispatchOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('dispatch_order', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.seller.orders() })
    },
  })
}

export type VariantInput = { id?: string; name: string; price: number; stock: number | null }

/** Replaces a product's options with the list given; options left out are removed. */
export function useSaveProductVariants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, variants }: { productId: string; variants: VariantInput[] }) => {
      const { error } = await supabase.rpc('save_product_variants', { p_product_id: productId, p_variants: variants })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.seller.products() })
      qc.invalidateQueries({ queryKey: keys.commerce.products() })
    },
  })
}

/** The seller's own coupons, or FindWork's for finance staff. */
export function useCoupons(platform: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.commerce.coupons(platform),
    enabled: Boolean(user),
    queryFn: async (): Promise<Coupon[]> => {
      const base = supabase.from('coupons').select('*')
      const { data, error } = await (platform ? base.is('seller_id', null) : base.eq('seller_id', user!.id)).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type CouponInput = {
  id?: string; code: string; kind: 'percent' | 'fixed'; value: number; minSpend: number; maxDiscount: number | null
  endsAt: string | null; usageLimit: number | null; perCustomer: number; active: boolean; platform: boolean
}

export function useSaveCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CouponInput) => {
      const { error } = await supabase.rpc('save_coupon', {
        p_id: input.id ?? null, p_code: input.code, p_kind: input.kind, p_value: input.value, p_min_spend: input.minSpend,
        p_max_discount: input.maxDiscount, p_ends_at: input.endsAt, p_usage_limit: input.usageLimit,
        p_per_customer_limit: input.perCustomer, p_active: input.active, p_platform: input.platform,
      })
      if (error) throw error
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: keys.commerce.coupons(input.platform) }),
  })
}
