import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { useStaff } from './admin'
import { keys } from './keys'
import type { Delivery, DeliveryStatus, RiderProfile, RiderVehicle } from '../database.types'

/** Never `*`: the delivery code column is not readable, and asking for it fails the whole query. */
const DELIVERY_COLUMNS =
  'id, order_id, rider_id, status, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, rider_fee, eta_minutes, eta_at, eta_source, assigned_at, picked_up_at, delivered_at, created_at'

export type AvailableDelivery = {
  id: string; pickup_address: string | null; dropoff_area: string; rider_fee: number
  delivery_speed: 'same-day' | 'standard'; created_at: string; pickup_km: number | null; trip_km: number | null
}

export type Tracking = {
  id: string; order_id: string; status: DeliveryStatus
  pickup_address: string | null; pickup_lat: number | null; pickup_lng: number | null
  dropoff_address: string; dropoff_lat: number | null; dropoff_lng: number | null
  eta_minutes: number | null; eta_at: string | null; eta_source: 'estimate' | 'routed'
  assigned_at: string | null; picked_up_at: string | null; delivered_at: string | null
  rider: { name: string; vehicle: RiderVehicle; plate: string | null; deliveries_done: number; lat: number | null; lng: number | null; located_at: string | null } | null
  /** Only for the customer. */
  code: string | null
  /** Only for the rider carrying the order. */
  contact_phone: string | null
  rider_fee: number | null
}

function useInvalidateLogistics() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.logistics.all })
    qc.invalidateQueries({ queryKey: keys.commerce.orders() })
    qc.invalidateQueries({ queryKey: keys.wallet.all })
  }
}

/** The signed-in person's rider profile, or null if they have never applied. */
export function useMyRider() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.logistics.rider(),
    enabled: Boolean(user),
    queryFn: async (): Promise<RiderProfile | null> => {
      const { data, error } = await supabase.from('rider_profiles').select('*').eq('id', user!.id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useApplyAsRider() {
  const invalidate = useInvalidateLogistics()
  return useMutation({
    mutationFn: async (input: { vehicle: RiderVehicle; plate: string; area: string | null }) => {
      const { error } = await supabase.rpc('apply_as_rider', { p_vehicle: input.vehicle, p_plate: input.plate, p_area: input.area })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetRiderOnline() {
  const invalidate = useInvalidateLogistics()
  return useMutation({
    mutationFn: async (online: boolean) => {
      const { error } = await supabase.rpc('set_rider_online', { p_online: online })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Reports where the rider is. Called from a location watch, so it is a plain function, not a hook. */
export async function reportRiderLocation(lat: number, lng: number) {
  const { error } = await supabase.rpc('update_rider_location', { p_lat: lat, p_lng: lng })
  if (error) throw error
}

/** Asks for a routed, traffic-aware arrival time. Quietly does nothing when no maps key is configured. */
export async function requestRoutedEta(orderId: string) {
  await supabase.functions.invoke('route-estimate', { body: { orderId } }).catch(() => null)
}

export function useAvailableDeliveries(enabled: boolean) {
  return useQuery({
    queryKey: keys.logistics.available(),
    enabled,
    refetchInterval: 20_000,
    queryFn: async (): Promise<AvailableDelivery[]> => {
      const { data, error } = await supabase.rpc('rider_available_deliveries')
      if (error) throw error
      return (data as unknown as AvailableDelivery[]) ?? []
    },
  })
}

/** The deliveries the rider is carrying or on the way to collect. */
export function useMyDeliveries(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.logistics.mine(),
    enabled: enabled && Boolean(user),
    refetchInterval: 30_000,
    queryFn: async (): Promise<Delivery[]> => {
      const { data, error } = await supabase.from('deliveries').select(DELIVERY_COLUMNS).eq('rider_id', user!.id)
        .in('status', ['assigned', 'picked_up']).order('assigned_at')
      if (error) throw error
      return data as unknown as Delivery[]
    },
  })
}

export function useRiderEarnings(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.logistics.earnings(),
    enabled: enabled && Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('wallet_transactions').select('balance_delta, created_at, label')
        .eq('profile_id', user!.id).eq('kind', 'delivery').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
      const isToday = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today
      return {
        total: data.reduce((sum, t) => sum + t.balance_delta, 0),
        today: data.filter((t) => isToday(t.created_at)).reduce((sum, t) => sum + t.balance_delta, 0),
        recent: data.slice(0, 10),
      }
    },
  })
}

function useDeliveryAction<T>(fn: (input: T) => Promise<void>) {
  const invalidate = useInvalidateLogistics()
  return useMutation({ mutationFn: fn, onSuccess: invalidate, onError: invalidate })
}

export function useAcceptDelivery() {
  return useDeliveryAction(async (deliveryId: string) => {
    const { error } = await supabase.rpc('accept_delivery', { p_delivery_id: deliveryId })
    if (error) throw error
  })
}

export function useReleaseDelivery() {
  return useDeliveryAction(async (deliveryId: string) => {
    const { error } = await supabase.rpc('release_delivery', { p_delivery_id: deliveryId })
    if (error) throw error
  })
}

export function useMarkPickedUp() {
  return useDeliveryAction(async (deliveryId: string) => {
    const { error } = await supabase.rpc('mark_delivery_picked_up', { p_delivery_id: deliveryId })
    if (error) throw error
  })
}

/** Hands the order over against the customer's code. A wrong code is counted, and reported as an error here. */
export function useCompleteDelivery() {
  return useDeliveryAction(async ({ deliveryId, code }: { deliveryId: string; code: string }) => {
    const { error } = await supabase.rpc('complete_delivery', { p_delivery_id: deliveryId, p_code: code })
    if (error) throw error
    const outcome = await supabase.rpc('delivery_outcome', { p_delivery_id: deliveryId })
    if (outcome.error) throw outcome.error
    const result = outcome.data as { status: DeliveryStatus; attempts_left: number } | null
    if (result?.status !== 'delivered') {
      throw new Error(result && result.attempts_left > 0
        ? `That is not the customer's code. ${result.attempts_left} tr${result.attempts_left === 1 ? 'y' : 'ies'} left.`
        : 'Too many wrong codes. Ask the customer to contact support.')
    }
  })
}

/** One delivery as the signed-in person may see it; null until the order is dispatched. */
export function useDeliveryTracking(orderId: string | undefined) {
  return useQuery({
    queryKey: keys.logistics.tracking(orderId ?? ''),
    enabled: Boolean(orderId),
    refetchInterval: (query) => (['awaiting_rider', 'assigned', 'picked_up'].includes(query.state.data?.status ?? '') ? 10_000 : false),
    queryFn: async (): Promise<Tracking | null> => {
      const { data, error } = await supabase.rpc('delivery_tracking', { p_order_id: orderId! })
      if (error) throw error
      return (data as unknown as Tracking | null) ?? null
    },
  })
}

export function useSetDeliveryDropoff() {
  const invalidate = useInvalidateLogistics()
  return useMutation({
    mutationFn: async (input: { orderId: string; lat: number; lng: number }) => {
      const { error } = await supabase.rpc('set_delivery_dropoff', { p_order_id: input.orderId, p_lat: input.lat, p_lng: input.lng })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/* ---- Staff ---------------------------------------------------------------- */

export type AdminRider = RiderProfile & { profile: { full_name: string; verified_at: string | null } | null }

export function useAdminRiders() {
  const allowed = useStaff().can('logistics')
  return useQuery({
    queryKey: keys.logistics.adminRiders(),
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AdminRider[]> => {
      const { data, error } = await supabase.from('rider_profiles')
        .select('*, profile:profiles!rider_profiles_id_fkey(full_name, verified_at)')
        .or('status.eq.pending,and(status.eq.approved,online.eq.true)').order('created_at')
      if (error) throw error
      return data as unknown as AdminRider[]
    },
  })
}

export function useAdminDeliveries() {
  const allowed = useStaff().can('logistics')
  return useQuery({
    queryKey: keys.logistics.adminDeliveries(),
    enabled: allowed,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Delivery[]> => {
      const { data, error } = await supabase.from('deliveries').select(DELIVERY_COLUMNS)
        .in('status', ['awaiting_rider', 'assigned', 'picked_up']).order('created_at')
      if (error) throw error
      return data as unknown as Delivery[]
    },
  })
}

export function useAdminReviewRider() {
  return useDeliveryAction(async ({ riderId, approve, note }: { riderId: string; approve: boolean; note: string }) => {
    const { error } = await supabase.rpc('admin_review_rider', { p_rider_id: riderId, p_approve: approve, p_note: note })
    if (error) throw error
  })
}

export function useAdminAssignDelivery() {
  return useDeliveryAction(async ({ deliveryId, riderId }: { deliveryId: string; riderId: string }) => {
    const { error } = await supabase.rpc('admin_assign_delivery', { p_delivery_id: deliveryId, p_rider_id: riderId })
    if (error) throw error
  })
}
