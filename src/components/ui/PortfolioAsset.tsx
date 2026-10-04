import { usePrivateMedia } from '../../lib/api/storage'
import type { ProviderMedia } from '../../lib/database.types'

export function PortfolioAsset({ item }: { item: ProviderMedia }) {
  const media = usePrivateMedia('provider-media', item.path)
  return <div className="space-y-2">
    {media.isLoading && <p className="text-sm text-muted">Loading media…</p>}
    {media.isError && <button className="min-h-11 text-sm underline" onClick={() => void media.refetch()}>Media unavailable. Retry</button>}
    {media.data && (item.mime.startsWith('video/') ? (
      <video controls playsInline preload="metadata" src={media.data} aria-label={item.title} className="w-full max-h-80 rounded-xl bg-ink" />
    ) : item.mime === 'application/pdf' ? (
      <a href={media.data} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 text-brand underline">View {item.title} (PDF)</a>
    ) : <img src={media.data} alt={item.title} loading="lazy" className="w-full max-h-80 object-contain rounded-xl" />)}
    <h3 className="font-semibold text-ink">{item.title}</h3>
    {item.description && <p className="text-sm text-muted whitespace-pre-wrap">{item.description}</p>}
    {item.kind === 'certificate' && <p className="text-xs text-muted">Credential supplied by this provider. FindWork has not independently verified it.</p>}
  </div>
}
