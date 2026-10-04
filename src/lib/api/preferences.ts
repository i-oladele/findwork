import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { disablePush, enablePush, pushEnabled } from '../push'
import { keys } from './keys'
import type { Language, UserPreferences } from '../database.types'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pcm', label: 'Pidgin' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ha', label: 'Hausa' },
]

export type Preferences = Pick<UserPreferences, 'language' | 'muted_kinds' | 'interests' | 'skills' | 'analytics'>
const DEFAULTS: Preferences = { language: 'en', muted_kinds: [], interests: [], skills: [], analytics: true }

/** Language, muted notification kinds and interests; defaults until the person changes one. */
export function usePreferences() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.preferences.mine(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase.from('user_preferences').select('language, muted_kinds, interests, skills, analytics').eq('profile_id', user!.id).maybeSingle()
      if (error) throw error
      return data ?? DEFAULTS
    },
  })
}

export function useSavePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: Omit<Preferences, 'skills' | 'analytics'>) => {
      const { error } = await supabase.rpc('save_preferences', { p_language: prefs.language, p_muted_kinds: prefs.muted_kinds, p_interests: prefs.interests })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.preferences.mine() }),
  })
}

/** Whether this browser is subscribed to push. */
export function usePushEnabled() {
  return useQuery({ queryKey: keys.preferences.push(), queryFn: pushEnabled })
}

export function useSetPush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => (on ? enablePush() : disablePush()),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.preferences.push() }),
  })
}

/** Turning usage analytics off also erases what was recorded. */
export function useSetAnalyticsConsent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (allowed: boolean) => {
      const { error } = await supabase.rpc('set_analytics_consent', { p_allowed: allowed })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.preferences.mine() }),
  })
}
