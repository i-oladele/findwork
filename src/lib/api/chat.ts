import { useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  last_message: ChatMessage
  last_message_at: string
  unread: number
}

const INBOX_PAGE = 30
const MESSAGE_PAGE = 100

/**
 * The inbox, newest conversation first, a page at a time. Each row carries
 * its own latest message and unread count from the server (chat_inbox), so
 * one busy conversation cannot push the others out.
 */
export function useThreads() {
  const { user } = useAuth()

  return useInfiniteQuery({
    queryKey: keys.chat.threads(),
    enabled: Boolean(user),
    initialPageParam: null as { at: string; thread: string } | null,
    queryFn: async ({ pageParam }): Promise<ThreadSummary[]> => {
      const { data, error } = await supabase.rpc('chat_inbox', {
        p_limit: INBOX_PAGE,
        ...(pageParam && { p_before_at: pageParam.at, p_before_thread: pageParam.thread }),
      })
      if (error) throw error
      return data.map((row) => ({
        thread_id: row.thread_id,
        last_read_at: row.last_read_at,
        other: row.other_id
          ? { id: row.other_id, full_name: row.other_name ?? '', avatar_url: row.other_avatar_url }
          : null,
        last_message: row.last_message,
        last_message_at: row.last_message_at,
        unread: row.unread,
      }))
    },
    getNextPageParam: (page) => {
      const last = page.at(-1)
      return page.length < INBOX_PAGE || !last ? undefined : { at: last.last_message_at, thread: last.thread_id }
    },
    select: (data) => data.pages.flat(),
  })
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

/**
 * A conversation, oldest first on screen, loaded newest first a page at a
 * time. Loading it all in one request would stop at the API's row limit and
 * leave out the newest messages of a long conversation, the ones that matter.
 */
export function useMessages(threadId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.chat.messages(threadId ?? ''),
    enabled: Boolean(threadId),
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }): Promise<ChatMessage[]> => {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE)
      if (pageParam) {
        // Everything before the oldest message already shown, ties broken by id.
        query = query.or(
          `created_at.lt."${pageParam.at}",and(created_at.eq."${pageParam.at}",id.lt.${pageParam.id})`,
        )
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
    getNextPageParam: (page) => {
      const oldest = page.at(-1)
      return page.length < MESSAGE_PAGE || !oldest ? undefined : { at: oldest.created_at, id: oldest.id }
    },
    select: (data) => data.pages.flat().reverse(),
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
