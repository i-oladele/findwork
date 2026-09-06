import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Booking } from '../database.types'

/** Platform commission, matching round(price * 0.05) in pay_booking. */
export const PLATFORM_FEE_RATE = 0.05

export function platformFee(price: number) {
  return Math.round(price * PLATFORM_FEE_RATE)
}

export function useBookings() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.bookings.mine(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Booking[]> => {
      // RLS returns bookings where the user is either the customer or the
      // provider, so one query covers both sides of the app.
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('start_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: keys.bookings.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Booking> => {
      const { data, error } = await supabase.from('bookings').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

/**
 * Books and pays in one transaction: the escrow ledger row, the double-booking
 * guard and the balance check all live inside pay_booking, so a client cannot
 * book without paying or book a taken slot.
 */
export function usePayBooking() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      providerId: string
      service: string
      price: number
      startAt: Date | string
      durationMinutes?: number
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('pay_booking', {
        p_provider_id: input.providerId,
        p_service: input.service,
        p_price: input.price,
        p_start_at:
          typeof input.startAt === 'string' ? input.startAt : input.startAt.toISOString(),
        p_duration_minutes: input.durationMinutes ?? 60,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.bookings.all })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}

/** Customer marks the job done, releasing escrow and paying the provider. */
export function useCompleteBooking() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.bookings.all })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
      qc.invalidateQueries({ queryKey: keys.providers.all })
    },
  })
}
