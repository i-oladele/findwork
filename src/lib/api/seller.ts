import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Product } from '../database.types'
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
