import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'

/** Largest photo accepted. Phone cameras produce 3-5 MB; this leaves room. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type UploadBucket = 'classifieds-photos' | 'provider-portfolios' | 'dispute-evidence' | 'avatars'

/**
 * Uploads a file under the caller's own folder ("<uid>/<random>.<ext>"),
 * which is what the storage policies check. Public buckets return a public
 * URL; the private evidence bucket returns the object path, which only the
 * uploader and admins can turn into a signed URL.
 */
export function useUpload(bucket: UploadBucket) {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!file.type.startsWith('image/')) throw new Error('Choose a photo.')
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('That photo is too large (8 MB max).')

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user!.id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (error) throw error

      if (bucket === 'dispute-evidence') return path
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    },
  })
}

/** Short-lived link to a private evidence photo. */
export async function evidenceUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('dispute-evidence').createSignedUrl(path, 60 * 10)
  return data?.signedUrl ?? null
}

/** Private links are short lived and scoped to the current signed-in user. */
export function usePrivateMedia(bucket: 'chat-attachments' | 'dispute-evidence', path: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['private-media', user?.id, bucket, path],
    enabled: Boolean(user && path),
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 10 * 60)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('This attachment is unavailable.')
      return data.signedUrl
    },
  })
}
