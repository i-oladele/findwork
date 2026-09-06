import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ChatMessage } from '../database.types'

export type ThreadSummary = {
  thread_id: string
  last_read_at: string
  other: { id: string; full_name: string; avatar_url: string | null } | null
  last_message: ChatMessage | null
  unread: number
}

export function useThreads() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.chat.threads(),
    enabled: Boolean(user),
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data: memberships, error } = await supabase
        .from('thread_participants')
        .select('thread_id, last_read_at')
      if (error) throw error
      if (!memberships?.length) return []

      const threadIds = memberships.map((m) => m.thread_id)

      // The other participant in each thread, and the messages, in two more
      // round trips rather than N+1 per thread.
      const [{ data: others }, { data: messages }] = await Promise.all([
        supabase
          .from('thread_participants')
          .select('thread_id, profiles(id, full_name, avatar_url)')
          .in('thread_id', threadIds)
          .neq('profile_id', user!.id),
        supabase
          .from('chat_messages')
          .select('*')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false }),
      ])

      return memberships
        .map((m) => {
          const threadMessages = (messages ?? []).filter((msg) => msg.thread_id === m.thread_id)
          const other = (others ?? []).find((o) => o.thread_id === m.thread_id)
          return {
            thread_id: m.thread_id,
            last_read_at: m.last_read_at,
            other: other?.profiles ?? null,
            last_message: threadMessages[0] ?? null,
            unread: threadMessages.filter(
              (msg) => msg.sender_id !== user!.id && msg.created_at > m.last_read_at,
            ).length,
          }
        })
        .sort((a, b) => (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? ''))
    },
  })
}

export function useMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: keys.chat.messages(threadId ?? ''),
    enabled: Boolean(threadId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useSendMessage(threadId: string | undefined) {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { text: string; kind?: 'text' | 'voice' }) => {
      const { error } = await supabase.from('chat_messages').insert({
        thread_id: threadId!,
        sender_id: user!.id,
        text: input.text,
        kind: input.kind ?? 'text',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.chat.messages(threadId ?? '') })
      qc.invalidateQueries({ queryKey: keys.chat.threads() })
    },
  })
}

/** Opens the thread with another user, reusing the existing one if present. */
export function useOpenThread() {
  return useMutation({
    mutationFn: async (otherProfileId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('get_or_create_thread', {
        p_other_profile_id: otherProfileId,
      })
      if (error) throw error
      return data
    },
  })
}

export function useMarkThreadRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.rpc('mark_thread_read', { p_thread_id: threadId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.chat.threads() })
    },
  })
}

/** Live messages for an open thread. chat_messages is on the publication. */
export function useThreadRealtime(threadId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!threadId) return

    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: keys.chat.messages(threadId) }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, qc])
}
