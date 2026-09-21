import { useRef, useState } from 'react'
import { Spinner } from '../system/States'
import { useProfile, useUpdateProfile, useUpload } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'

/**
 * Profile photo. Tapping the picture opens the camera or gallery; the file
 * goes to the public avatars bucket under the user's own folder, and the
 * resulting URL is saved on the profile.
 */
export function AvatarUpload({ className = '' }: { className?: string }) {
  const { data: profile } = useProfile()
  const upload = useUpload('avatars')
  const updateProfile = useUpdateProfile()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = upload.isPending || updateProfile.isPending

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const url = await upload.mutateAsync(file)
      await updateProfile.mutateAsync({ avatar_url: url })
    } catch (err) {
      setError(friendlyError(err))
    }
    if (input.current) input.current.value = ''
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={profile?.avatar_url ? 'Change your photo' : 'Add a photo'}
        className="relative w-[58px] h-[58px] rounded-full overflow-hidden bg-line-soft flex items-center justify-center"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <i className="ph-fill ph-user text-2xl text-muted-2" />
        )}
        <span className="absolute inset-x-0 bottom-0 h-[18px] bg-ink/70 flex items-center justify-center">
          {busy ? <Spinner className="w-3 h-3 border-white/40 border-t-white" /> : <i className="ph-fill ph-camera text-[11px] text-white" />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="mt-1 text-[12px] text-danger max-w-[120px]">{error}</p>}
    </div>
  )
}
