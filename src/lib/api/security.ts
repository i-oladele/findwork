import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { deviceId, deviceLabel } from '../device'
import { keys } from './keys'
import type { Device, SecurityEvent } from '../database.types'

const recorded = new Set<string>()

/**
 * Tells the server this device is in use, once per signed-in account per
 * page load. A device the account has not used before earns a warning.
 */
export function useSignInRecorder(ready = true) {
  const { user } = useAuth()
  const id = user?.id
  useEffect(() => {
    if (!ready || !id || recorded.has(id)) return
    recorded.add(id)
    // Best effort: a failed record must never get in the way of using the app.
    void supabase.rpc('record_sign_in', { p_device_id: deviceId(), p_label: deviceLabel() }).then(({ error }) => {
      if (error) recorded.delete(id)
    })
  }, [id, ready])
}

export function useDevices() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.security.devices(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Device[]> => {
      const { data, error } = await supabase.from('devices').select('*').eq('profile_id', user!.id).order('last_seen_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSecurityEvents() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.security.events(),
    enabled: Boolean(user),
    queryFn: async (): Promise<SecurityEvent[]> => {
      const { data, error } = await supabase.from('security_events').select('*').eq('profile_id', user!.id)
        .order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      return data
    },
  })
}
