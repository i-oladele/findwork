import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { DeliverySpeed, Order, OrderItem, Product } from '../database.types'

/** Must match the case expression in place_order. */
export const DELIVERY_FEE: Record<DeliverySpeed, number> = { 'same-day': 1800, standard: 1200 }

export type OrderWithItems = Order & { order_items: OrderItem[] }

export function useProducts() {
  return useQuery({
    queryKey: keys.commerce.products(),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('*').order('name')
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
      items: { product_id: string; qty: number }[]
      deliverySpeed: DeliverySpeed
      address: string
      phone: string
      // One order per seller in the cart: they ship and get paid separately.
    }): Promise<string[]> => {
      const { data, error } = await supabase.rpc('place_order', {
        p_items: input.items,
        p_delivery_speed: input.deliverySpeed,
        p_address: input.address,
        p_phone: input.phone,
      })
      if (error) throw error
      return (data ?? []) as string[]
    },
    onSuccess: () => {
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
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}
