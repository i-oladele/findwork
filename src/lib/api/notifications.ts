import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { NotificationRow } from '../database.types'

export function useNotifications(limit = 50) {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.notifications.list(),
    enabled: Boolean(user),
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

export function useUnreadCount() {
  const { data } = useNotifications()
  return data?.filter((n) => !n.read_at).length ?? 0
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.notifications.all })
    },
  })
}

/** Live inbox: notifications are on the realtime publication. */
export function useNotificationsRealtime() {
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: keys.notifications.all }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, qc])
}
