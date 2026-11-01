import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { useStaff } from './admin'
import { keys } from './keys'
import type { Database, Meetup, SosDuty, SosShift, StaffRole, TrustedContact } from '../database.types'

type Person = { full_name: string; verification_tier: number; trust_score: number } | null
export type MeetupWithPeople = Meetup & { buyer: Person; seller: Person }

const SELECT =
  '*, buyer:profiles!meetups_buyer_id_fkey(full_name, verification_tier, trust_score), seller:profiles!meetups_seller_id_fkey(full_name, verification_tier, trust_score)'

function useInvalidateSafety() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.safety.all })
}

export function useMeetups() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.safety.meetups(),
    enabled: Boolean(user),
    queryFn: async (): Promise<MeetupWithPeople[]> => {
      const { data, error } = await supabase.from('meetups').select(SELECT).order('meet_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as unknown as MeetupWithPeople[]
    },
  })
}

export function useMeetup(id: string | undefined) {
  return useQuery({
    queryKey: keys.safety.meetup(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 30_000,
    queryFn: async (): Promise<MeetupWithPeople | null> => {
      const { data, error } = await supabase.from('meetups').select(SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as MeetupWithPeople | null
    },
  })
}

export function useProposeMeetup() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { classifiedId: string; place: string; meetAt: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('propose_meetup', { p_classified_id: input.classifiedId, p_place: input.place, p_meet_at: input.meetAt })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateMeetup() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { id: string; action: 'confirm' | 'complete' | 'cancel' }) => {
      const { error } = await supabase.rpc('update_meetup', { p_meetup_id: input.id, p_action: input.action })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export type MeetupLocations = {
  mine: { expires_at: string; located_at: string | null } | null
  theirs: { lat: number; lng: number; located_at: string; expires_at: string } | null
}

/** Whether you are sharing, and the other person's position while they are. */
export function useMeetupLocations(meetupId: string, live: boolean) {
  return useQuery({
    queryKey: keys.safety.locations(meetupId),
    refetchInterval: live ? 10_000 : false,
    queryFn: async (): Promise<MeetupLocations> => {
      const { data, error } = await supabase.rpc('meetup_locations', { p_meetup_id: meetupId })
      if (error) throw error
      return data as unknown as MeetupLocations
    },
  })
}

export function useStartLocationShare() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { meetupId: string; minutes: number }) => {
      const { error } = await supabase.rpc('start_location_share', { p_meetup_id: input.meetupId, p_minutes: input.minutes })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useStopLocationShare() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (meetupId: string) => {
      const { error } = await supabase.rpc('stop_location_share', { p_meetup_id: meetupId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Sends one position for a running share. Called from a location watch. */
export async function sendSharedLocation(meetupId: string, lat: number, lng: number) {
  const { error } = await supabase.rpc('update_location_share', { p_meetup_id: meetupId, p_lat: lat, p_lng: lng })
  if (error) throw error
}

export function useTrustedContacts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.safety.contacts(),
    enabled: Boolean(user),
    queryFn: async (): Promise<TrustedContact[]> => {
      const { data, error } = await supabase.from('trusted_contacts').select('*').eq('profile_id', user!.id).order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useSaveTrustedContact() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { name: string; phone: string }) => {
      const { error } = await supabase.rpc('save_trusted_contact', { p_name: input.name, p_phone: input.phone })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemoveTrustedContact() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('remove_trusted_contact', { p_contact_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Alerts the FindWork team. Pressing again updates the same alert. */
export function useRaiseSos() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { meetupId: string | null; lat: number | null; lng: number | null; note: string }) => {
      const { error } = await supabase.rpc('raise_sos', { p_meetup_id: input.meetupId, p_lat: input.lat, p_lng: input.lng, p_note: input.note.trim() || null })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export type AdminSos = Database['public']['Functions']['admin_sos_queue']['Returns'][number]

/** The open SOS alerts, with the person's phone, who they were meeting and who has it. */
export function useAdminSos() {
  const allowed = useStaff().can('users')
  return useQuery({
    queryKey: keys.safety.sos(),
    enabled: allowed,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AdminSos[]> => {
      const { data, error } = await supabase.rpc('admin_sos_queue')
      if (error) throw error
      return (data ?? []).map((a) => ({ ...a, lat: a.lat == null ? null : Number(a.lat), lng: a.lng == null ? null : Number(a.lng) }))
    },
  })
}

/** "I'm on it": one member of staff takes the alert, and the person is told someone is calling. */
export function useAdminTakeSos() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_take_sos', { p_alert_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAdminHandleSos() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { id: string; note: string }) => {
      const { error } = await supabase.rpc('admin_handle_sos', { p_alert_id: input.id, p_note: input.note })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export type RotaShift = SosShift & { staff: { full_name: string } | null }

/**
 * The rota from the start of this hour for the given number of days: the
 * shifts in that window and the times nobody is on call. The window moves
 * on the hour, so it stays the same between renders.
 */
export function useSosRota(days: number) {
  const allowed = useStaff().can('users')
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const window = { from: new Date(hour).toISOString(), to: new Date(hour + days * 86_400_000).toISOString() }
  return useQuery({
    queryKey: keys.safety.rota(window.from, window.to),
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [shifts, gaps] = await Promise.all([
        supabase.from('sos_shifts').select('*, staff:profiles!sos_shifts_staff_id_fkey(full_name)')
          .gt('ends_at', window.from).lt('starts_at', window.to).order('starts_at'),
        supabase.rpc('sos_rota_gaps', { p_from: window.from, p_to: window.to }),
      ])
      if (shifts.error) throw shifts.error
      if (gaps.error) throw gaps.error
      return { shifts: shifts.data as unknown as RotaShift[], gaps: gaps.data ?? [] }
    },
  })
}

/** The admins and moderators who can be put on call. */
export function useSosStaff() {
  const allowed = useStaff().can('users')
  return useQuery({
    queryKey: keys.safety.sosStaff(),
    enabled: allowed,
    queryFn: async (): Promise<{ id: string; full_name: string; staff_role: StaffRole }[]> => {
      const { data, error } = await supabase.rpc('admin_sos_staff')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSaveSosShift() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (input: { staffId: string; duty: SosDuty; startsAt: Date; endsAt: Date }) => {
      const { error } = await supabase.rpc('admin_save_sos_shift', {
        p_staff_id: input.staffId, p_duty: input.duty, p_starts_at: input.startsAt.toISOString(), p_ends_at: input.endsAt.toISOString(),
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Removes a shift that has not started; ends one that is under way. */
export function useRemoveSosShift() {
  const invalidate = useInvalidateSafety()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_remove_sos_shift', { p_shift_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
