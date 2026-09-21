import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Booking, BookingReschedule } from '../database.types'

/** Customer service fee, matching round(price * 0.05) in private.create_booking. */
export const PLATFORM_FEE_RATE = 0.05

export function platformFee(price: number) {
  return Math.round(price * PLATFORM_FEE_RATE)
}

export type BookingWithCustomer = Booking & {
  customer: { full_name: string; avatar_url: string | null } | null
  provider: { photo_urls: string[] } | null
}

/**
 * RLS returns bookings where the user is either the customer or the
 * provider, so one query serves both sides; screens split them by id.
 */
export function useBookings() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.bookings.mine(),
    enabled: Boolean(user),
    queryFn: async (): Promise<BookingWithCustomer[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, customer:profiles!bookings_customer_id_fkey(full_name, avatar_url), provider:provider_profiles!bookings_provider_id_fkey(photo_urls)',
        )
        .order('start_at', { ascending: true })
      if (error) throw error
      return data as unknown as BookingWithCustomer[]
    },
  })
}

/** Bookings the signed-in user made, as a customer. */
export function useMyBookings() {
  const { user } = useAuth()
  const query = useBookings()
  return { ...query, data: query.data?.filter((b) => b.customer_id === user?.id) }
}

/** Bookings made with the signed-in user, as a provider. */
export function useIncomingBookings() {
  const { user } = useAuth()
  const query = useBookings()
  return { ...query, data: query.data?.filter((b) => b.provider_id === user?.id) }
}

export function useBooking(id: string | undefined, live = false) {
  return useQuery({
    queryKey: keys.bookings.detail(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: live ? 15_000 : false,
    queryFn: async (): Promise<BookingWithCustomer | null> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, customer:profiles!bookings_customer_id_fkey(full_name, avatar_url), provider:provider_profiles!bookings_provider_id_fkey(photo_urls)',
        )
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as BookingWithCustomer | null
    },
  })
}

function useInvalidateBookings() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.bookings.all })
    qc.invalidateQueries({ queryKey: keys.wallet.all })
    qc.invalidateQueries({ queryKey: keys.providers.all })
    qc.invalidateQueries({ queryKey: keys.notifications.all })
  }
}

/**
 * Books and pays into escrow in one transaction. The price is read from the
 * package server-side; the client only says which package and when.
 */
export function usePayBooking() {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: async (input: { providerId: string; packageId: string | null; startAt: string }) => {
      const { data, error } = await supabase.rpc('pay_booking', {
        p_provider_id: input.providerId,
        p_package_id: input.packageId,
        p_start_at: input.startAt,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

/** Provider accepts or declines a pending booking. Declining refunds the customer. */
export function useRespondToBooking() {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: async ({ bookingId, accept }: { bookingId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_to_booking', { p_booking_id: bookingId, p_accept: accept })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Either side cancels before the start time; the customer is refunded in full. */
export function useCancelBooking() {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Customer marks the job done, releasing escrow to the provider. */
export function useCompleteBooking() {
  const invalidate = useInvalidateBookings()

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useBookingReschedules(bookingId: string | undefined) {
  return useQuery({
    queryKey: keys.bookings.reschedules(bookingId ?? ''),
    enabled: Boolean(bookingId),
    refetchInterval: 15_000,
    queryFn: async (): Promise<BookingReschedule[]> => {
      const { data, error } = await supabase.from('booking_reschedules').select('*')
        .eq('booking_id', bookingId!).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useRequestReschedule() {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (input: { bookingId: string; startAt: string; reason: string }) => {
      const { data, error } = await supabase.rpc('request_booking_reschedule', {
        p_booking_id: input.bookingId, p_start_at: input.startAt, p_reason: input.reason,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useRespondReschedule() {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (input: { requestId: string; action: 'accept' | 'decline' | 'withdraw' }) => {
      const { error } = await supabase.rpc('respond_booking_reschedule', {
        p_request_id: input.requestId, p_action: input.action,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
