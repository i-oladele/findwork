import { useRef } from 'react'
import { Spinner } from '../system/States'
import { useUpload, type UploadBucket } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'

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
}: {
  bucket: UploadBucket
  value: string[]
  onChange: (next: string[]) => void
  onError: (message: string | null) => void
  max?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  // Private uploads have no public URL to show, so keep a local preview of
  // each file picked in this session, keyed by what the upload returned.
  const previews = useRef<Record<string, string>>({})
  const upload = useUpload(bucket)

  async function pick(files: FileList | null) {
    if (!files?.length) return
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
    if (input.current) input.current.value = ''
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      {value.map((v) => (
        <div key={v} className="relative w-[74px] h-[74px]">
          <img src={previews.current[v] ?? v} alt="" className="w-full h-full object-cover rounded-lg bg-line-soft" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => onChange(value.filter((x) => x !== v))}
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
          disabled={upload.isPending}
          aria-label="Add photo"
          className="w-[74px] h-[74px] border-[1.5px] border-dashed border-muted-4 rounded-lg flex items-center justify-center text-muted-2"
        >
          {upload.isPending ? <Spinner className="w-5 h-5" /> : <i className="ph ph-camera text-2xl" />}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}
