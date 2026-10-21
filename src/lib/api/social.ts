import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { LiveStream, Product } from '../database.types'

export type FeedPost = {
  id: string; author_id: string; kind: 'story' | 'reel'; media_path: string; mime: string; caption: string
  views: number; likes: number; created_at: string; expires_at: string | null
  author_name: string; author_photo: string | null; author_verified: boolean; liked: boolean
  product: { id: string; name: string; price: number } | null
}

const STORY_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
const REEL_MIME = ['video/mp4', 'video/webm']
export const POST_MIME = { story: STORY_MIME, reel: REEL_MIME }
const MAX_BYTES = 50 * 1024 * 1024

/** Live stories and reels, newest first: everyone's, or one seller's. */
export function useSocialFeed(kind: 'story' | 'reel' | null, authorId: string | null = null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.social.feed(kind, authorId),
    enabled: Boolean(user),
    queryFn: async (): Promise<FeedPost[]> => {
      const { data, error } = await supabase.rpc('social_feed', { p_kind: kind, p_author_id: authorId })
      if (error) throw error
      return (data as unknown as FeedPost[]) ?? []
    },
  })
}

function useInvalidateSocial() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.social.all })
}

/** Uploads the file, then publishes it. An upload that is never published stays private to the seller. */
export function usePublishPost() {
  const { user } = useAuth()
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (input: { kind: 'story' | 'reel'; file: File; caption: string; productId: string | null }) => {
      if (!user) throw new Error('Sign in to post.')
      if (!POST_MIME[input.kind].includes(input.file.type)) throw new Error(input.kind === 'reel' ? 'A reel is a video: choose an MP4 or WebM.' : 'Choose a photo, or an MP4 or WebM video.')
      if (input.file.size < 1 || input.file.size > MAX_BYTES) throw new Error('Choose a file smaller than 50 MB.')
      const extension = input.file.type.split('/')[1].replace('jpeg', 'jpg')
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`
      const upload = await supabase.storage.from('social-media').upload(path, input.file, { contentType: input.file.type, upsert: false })
      if (upload.error) throw upload.error
      const { error } = await supabase.rpc('publish_post', { p_kind: input.kind, p_path: path, p_caption: input.caption, p_product_id: input.productId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemovePost() {
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (postId: string) => {
      const { data: path, error } = await supabase.rpc('remove_post', { p_post_id: postId })
      if (error) throw error
      // Taking the post down hides it at once; the file is tidied up after.
      await supabase.storage.from('social-media').remove([path])
    },
    onSuccess: invalidate,
  })
}

/** Best effort: a view that fails to record must not interrupt watching. */
export function recordPostView(postId: string) {
  void supabase.rpc('record_post_view', { p_post_id: postId })
}

export function useTogglePostLike() {
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('toggle_post_like', { p_post_id: postId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/* ---- Livestream selling --------------------------------------------------- */

export type StreamWithSeller = LiveStream & { seller: { business_name: string; photo_urls: string[]; verified: boolean } | null }
const STREAM_SELECT = '*, seller:provider_profiles!live_streams_seller_id_fkey(business_name, photo_urls, verified)'

/** Streams that are live or coming up, live first. */
export function useStreams() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.social.streams(),
    enabled: Boolean(user),
    refetchInterval: 30_000,
    queryFn: async (): Promise<StreamWithSeller[]> => {
      const { data, error } = await supabase.from('live_streams').select(STREAM_SELECT).in('status', ['live', 'scheduled'])
        .order('status').order('scheduled_for', { ascending: true, nullsFirst: false }).limit(50)
      if (error) throw error
      return data as unknown as StreamWithSeller[]
    },
  })
}

export function useStream(id: string | undefined) {
  return useQuery({
    queryKey: keys.social.stream(id ?? ''),
    enabled: Boolean(id),
    // The pinned product and the status change while people watch.
    refetchInterval: (query) => (query.state.data?.status === 'ended' ? false : 5_000),
    queryFn: async (): Promise<StreamWithSeller | null> => {
      const { data, error } = await supabase.from('live_streams').select(STREAM_SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as StreamWithSeller | null
    },
  })
}

export function useStreamProducts(streamId: string | undefined) {
  return useQuery({
    queryKey: keys.social.streamProducts(streamId ?? ''),
    enabled: Boolean(streamId),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('stream_products').select('position, product:products!stream_products_product_id_fkey(*)')
        .eq('stream_id', streamId!).order('position')
      if (error) throw error
      return (data as unknown as { product: Product | null }[]).flatMap((row) => (row.product ? [row.product] : []))
    },
  })
}

export type StreamMessage = { id: string; sender_id: string; body: string; created_at: string; sender: { full_name: string } | null }

export function useStreamMessages(streamId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: keys.social.streamMessages(streamId ?? ''),
    enabled: Boolean(streamId),
    refetchInterval: live ? 3_000 : false,
    queryFn: async (): Promise<StreamMessage[]> => {
      const { data, error } = await supabase.from('stream_messages')
        .select('id, sender_id, body, created_at, sender:profiles!stream_messages_sender_id_fkey(full_name)')
        .eq('stream_id', streamId!).order('created_at', { ascending: false }).limit(60)
      if (error) throw error
      return (data as unknown as StreamMessage[]).reverse()
    },
  })
}

/** Tells the server this viewer is still watching; the answer is how many are. */
export function useStreamViewers(streamId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: [...keys.social.stream(streamId ?? ''), 'viewers'],
    enabled: Boolean(streamId) && live,
    refetchInterval: 20_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('stream_heartbeat', { p_stream_id: streamId! })
      if (error) throw error
      return data
    },
  })
}

export function useScheduleStream() {
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (input: { title: string; video: 'link' | 'livekit'; playbackUrl: string | null; scheduledFor: string | null; productIds: string[] }): Promise<string> => {
      const { data, error } = await supabase.rpc('schedule_stream', {
        p_title: input.title, p_playback_url: input.playbackUrl, p_scheduled_for: input.scheduledFor, p_product_ids: input.productIds, p_video: input.video,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateStream() {
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (input: { id: string; action: 'start' | 'end' | 'pin'; productId?: string | null }) => {
      const { error } = await supabase.rpc('update_stream', { p_stream_id: input.id, p_action: input.action, p_product_id: input.productId ?? null })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSendStreamMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { streamId: string; body: string }) => {
      const { error } = await supabase.rpc('send_stream_message', { p_stream_id: input.streamId, p_body: input.body })
      if (error) throw error
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: keys.social.streamMessages(input.streamId) }),
  })
}

export function useRemoveStreamMessage() {
  const invalidate = useInvalidateSocial()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('remove_stream_message', { p_message_id: messageId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Whether FindWork Live (video carried through LiveKit) is set up on the server. */
export function useLiveVideoAvailable() {
  return useQuery({
    queryKey: keys.social.liveVideo(),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.functions.invoke('livekit-token', { body: { action: 'status' } })
      if (error) return false
      return Boolean((data as { configured?: boolean }).configured)
    },
  })
}

export type StreamRoomAccess = { url: string; token: string; publish: boolean }

/** A short-lived pass into a stream's video room; the server decides whether it may broadcast. */
export async function joinStreamRoom(streamId: string): Promise<StreamRoomAccess> {
  const { data, error } = await supabase.functions.invoke('livekit-token', { body: { action: 'join', stream_id: streamId } })
  if (error) {
    const status = (error as { context?: Response }).context?.status
    throw new Error(status === 403 ? 'This stream is not open to watch.' : 'We could not connect to the video. Try again.')
  }
  return data as StreamRoomAccess
}

/** After ending a stream, the seller closes its room so nobody is left watching an empty one. */
export async function closeStreamRoom(streamId: string): Promise<void> {
  await supabase.functions.invoke('livekit-token', { body: { action: 'close', stream_id: streamId } })
}
