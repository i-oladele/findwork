import { usePrivateMedia } from '../../lib/api/storage'
import type { ChatMessage } from '../../lib/database.types'

export function ChatAttachment({ message }: { message: ChatMessage }) {
  const media = usePrivateMedia('chat-attachments', message.attachment_path)
  if (!message.attachment_path) return null
  if (media.isLoading) return <p role="status" className="text-sm">Loading attachment…</p>
  if (media.isError) return <button type="button" className="text-sm underline" onClick={() => media.refetch()}>Attachment unavailable — retry</button>
  if (!media.data) return null
  const label = message.attachment_name || 'Attachment'
  return <div className="mb-2 max-w-full overflow-hidden">
    {message.kind === 'image' && <a href={media.data} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}>
      <img src={media.data} alt={label} loading="lazy" className="max-h-64 w-full object-contain rounded-lg" />
    </a>}
    {message.kind === 'video' && <video src={media.data} controls playsInline preload="metadata" aria-label={label} className="w-full max-h-64 rounded-lg" />}
    {message.kind === 'voice' && <audio src={media.data} controls preload="metadata" aria-label="Voice message" className="max-w-full" />}
    {message.kind === 'file' && <a href={media.data} target="_blank" rel="noopener noreferrer" className="block underline break-words">
      <i className="ph ph-file-pdf mr-1" />{label}
    </a>}
  </div>
}

export function EvidenceGallery({ paths }: { paths: string[] }) {
  return <div className="flex flex-wrap gap-3 mt-3" aria-label="Evidence photos">
    {paths.map((path, index) => <EvidencePhoto key={path} path={path} index={index} />)}
  </div>
}

function EvidencePhoto({ path, index }: { path: string; index: number }) {
  const media = usePrivateMedia('dispute-evidence', path)
  if (media.isLoading) return <p role="status" className="text-sm text-muted">Loading photo {index + 1}…</p>
  if (media.isError) return <button type="button" className="text-sm text-brand-hover underline" onClick={() => media.refetch()}>Retry photo {index + 1}</button>
  if (!media.data) return null
  return <a href={media.data} target="_blank" rel="noopener noreferrer" aria-label={`Open evidence photo ${index + 1}`}>
    <img src={media.data} alt={`Evidence photo ${index + 1}`} loading="lazy" className="w-24 h-24 object-cover rounded-lg border border-line" />
  </a>
}
