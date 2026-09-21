import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { ChatMessage } from '../database.types'
import { chatFileInfo } from '../chatMedia'

export type Participant = { id: string; full_name: string; avatar_url: string | null }

export type ThreadSummary = {
  thread_id: string
  last_read_at: string
  other: Participant | null
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
        .eq('profile_id', user!.id)
      if (error) throw error
      if (!memberships?.length) return []

      const threadIds = memberships.map((m) => m.thread_id)

      // The other participant in each thread, and the messages, in two more
      // round trips rather than N+1 per thread.
      const [others, messages] = await Promise.all([
        supabase
          .from('thread_participants')
          .select('thread_id, profiles(id, full_name, avatar_url)')
          .in('thread_id', threadIds)
          .neq('profile_id', user!.id),
        supabase
          .from('chat_messages')
          .select('*')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
          .limit(500),
      ])
      if (others.error) throw others.error
      if (messages.error) throw messages.error

      return memberships
        .map((m) => {
          const threadMessages = messages.data.filter((msg) => msg.thread_id === m.thread_id)
          const other = others.data.find((o) => o.thread_id === m.thread_id)
          return {
            thread_id: m.thread_id,
            last_read_at: m.last_read_at,
            other: (other?.profiles as unknown as Participant | null) ?? null,
            last_message: threadMessages[0] ?? null,
            unread: threadMessages.filter(
              (msg) => msg.sender_id !== user!.id && msg.created_at > m.last_read_at,
            ).length,
          }
        })
        // Threads opened but never written in are clutter in the inbox.
        .filter((t) => t.last_message)
        .sort((a, b) => (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? ''))
    },
  })
}

export function useUnreadMessageCount() {
  const { data } = useThreads()
  return data?.reduce((sum, t) => sum + t.unread, 0) ?? 0
}

/** Who the signed-in user is talking to in a thread. */
export function useThreadPartner(threadId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.chat.thread(threadId ?? ''),
    enabled: Boolean(threadId && user),
    queryFn: async (): Promise<Participant | null> => {
      const { data, error } = await supabase
        .from('thread_participants')
        .select('profiles(id, full_name, avatar_url)')
        .eq('thread_id', threadId!)
        .neq('profile_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data?.profiles as unknown as Participant | null) ?? null
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
    mutationFn: async (input: { text: string }) => {
      const { error } = await supabase.from('chat_messages').insert({
        thread_id: threadId!,
        sender_id: user!.id,
        text: input.text,
        kind: 'text',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.chat.messages(threadId ?? '') })
      qc.invalidateQueries({ queryKey: keys.chat.threads() })
    },
  })
}

/** Deterministic upload/message ids make retrying a failed send safe. */
export function useSendChatAttachment(threadId: string | undefined) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ id, file, text }: { id: string; file: File; text: string }) => {
      if (!user || !threadId) throw new Error('Open a conversation before sending a file.')
      const { mime, extension } = chatFileInfo(file)
      const path = `${user.id}/${threadId}/${id}.${extension}`
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file, {
        contentType: mime, upsert: false,
      })
      // A previous attempt may have uploaded successfully before the connection
      // dropped. Files cannot be replaced, and the RPC checks ownership again.
      if (uploadError && String((uploadError as { statusCode?: string }).statusCode) !== '409') throw uploadError
      const { error } = await supabase.rpc('send_chat_attachment', {
        p_message_id: id, p_thread_id: threadId, p_path: path, p_name: file.name, p_text: text,
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
        { event: '*', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        () => {
          qc.invalidateQueries({ queryKey: keys.chat.messages(threadId) })
          qc.invalidateQueries({ queryKey: keys.chat.threads() })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, qc])
}
