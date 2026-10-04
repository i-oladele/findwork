import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { useStaff } from './admin'
import { keys } from './keys'
import type { Meetup, SosAlert, TrustedContact } from '../database.types'

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

export type AdminSos = SosAlert & { profile: { full_name: string } | null }

export function useAdminSos() {
  const allowed = useStaff().can('users')
  return useQuery({
    queryKey: keys.safety.sos(),
    enabled: allowed,
    refetchInterval: 15_000,
    queryFn: async (): Promise<AdminSos[]> => {
      const { data, error } = await supabase.from('sos_alerts').select('*, profile:profiles!sos_alerts_profile_id_fkey(full_name)')
        .eq('status', 'open').order('created_at')
      if (error) throw error
      return data as unknown as AdminSos[]
    },
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
