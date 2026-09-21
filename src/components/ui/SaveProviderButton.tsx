import { useFavouriteIds, useToggleFavourite } from '../../lib/api'

/** The heart. Filled when saved; optimistic, because it is cheap to undo. */
export function SaveProviderButton({
  providerId,
  tone = 'dark',
  className = '',
}: {
  providerId: string
  tone?: 'dark' | 'light'
  className?: string
}) {
  const { data: saved } = useFavouriteIds()
  const toggle = useToggleFavourite()
  const isSaved = saved?.has(providerId) ?? false

  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Remove from saved' : 'Save this provider'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle.mutate({ providerId, saved: isSaved })
      }}
      className={`inline-flex items-center justify-center w-11 h-11 rounded-full ${
        tone === 'light' ? 'bg-ink/55 text-cream' : 'text-ink'
      } ${className}`}
    >
      <i className={`${isSaved ? 'ph-fill ph-heart text-brand' : 'ph ph-heart'} text-xl`} />
    </button>
  )
}
