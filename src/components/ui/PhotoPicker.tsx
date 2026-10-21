import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../system/States'
import { useUpload, type UploadBucket } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { useT } from '../../lib/i18n'

/**
 * Pick photos from the camera or gallery and upload them straight away.
 * `value` holds what the upload returned: public URLs for public buckets,
 * object paths for the private evidence bucket.
 */
export function PhotoPicker({
  bucket,
  value,
  onChange,
  onError,
  max = 4,
  capture,
  onUploadingChange,
}: {
  bucket: UploadBucket
  value: string[]
  onChange: (next: string[]) => void
  onError: (message: string | null) => void
  max?: number
  /** Opens the camera straight away on phones: "user" for a selfie. */
  capture?: 'user' | 'environment'
  onUploadingChange?: (uploading: boolean) => void
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  // Private uploads have no public URL to show, so keep a local preview of
  // each file picked in this session, keyed by what the upload returned.
  const previews = useRef<Record<string, string>>({})
  const upload = useUpload(bucket)
  const [uploading, setUploading] = useState(false)
  useEffect(() => () => { for (const url of Object.values(previews.current)) URL.revokeObjectURL(url) }, [])

  async function pick(files: FileList | null) {
    if (!files?.length || uploading) return
    setUploading(true)
    onUploadingChange?.(true)
    onError(null)
    const next = [...value]
    for (const file of Array.from(files).slice(0, max - value.length)) {
      try {
        const uploaded = await upload.mutateAsync(file)
        previews.current[uploaded] = URL.createObjectURL(file)
        next.push(uploaded)
      } catch (err) {
        onError(friendlyError(err))
        break
      }
    }
    onChange(next)
    setUploading(false)
    onUploadingChange?.(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      {value.map((v) => (
        <div key={v} className="relative w-[74px] h-[74px]">
          <img src={previews.current[v] ?? v} alt="" className="w-full h-full object-cover rounded-lg bg-line-soft" />
          <button
            type="button"
            aria-label={t('Remove photo')}
            disabled={uploading}
            onClick={() => {
              if (previews.current[v]) { URL.revokeObjectURL(previews.current[v]); delete previews.current[v] }
              onChange(value.filter((x) => x !== v))
            }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center"
          >
            <i className="ph-bold ph-x text-xs" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          aria-label={t('Add photo')}
          className="w-[74px] h-[74px] border-[1.5px] border-dashed border-muted-4 rounded-lg flex items-center justify-center text-muted-2"
        >
          {uploading ? <Spinner className="w-5 h-5" /> : <i className="ph ph-camera text-2xl" />}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={max > 1}
        capture={capture}
        hidden
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}
