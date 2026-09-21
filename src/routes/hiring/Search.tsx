import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { Chip } from '../../components/ui/Chip'
import { ProviderCard } from '../../components/ui/ProviderCard'
import { QueryState } from '../../components/system/QueryState'
import { useProfile, useProviders, type ProviderFilters } from '../../lib/api'
import { distanceBetween } from '../../lib/distance'

const FILTERS = [
  { id: 'nearest', label: 'Nearest' },
  { id: 'budget', label: 'Under ₦15,000' },
  { id: 'verified', label: 'Verified' },
  { id: 'rated', label: '4.5+' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

/** Waits for typing to pause before searching, so each keystroke is not a request. */
function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function Search() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? undefined
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [active, setActive] = useState<FilterId[]>([])
  const debounced = useDebounced(query)

  const filters: ProviderFilters = {
    query: debounced,
    category,
    maxPrice: active.includes('budget') ? 15000 : undefined,
    verifiedOnly: active.includes('verified'),
    minRating: active.includes('rated') ? 4.5 : undefined,
  }
  const results = useProviders(filters)
  const { data: profile } = useProfile()

  // Distance is worked out here rather than in the query: the ranking only
  // has to be right for the providers already on screen, and it needs the
  // viewer's own area, which the server-side search does not take.
  const withDistance = results.data?.map((p) => ({ provider: p, km: distanceBetween(profile, p) }))
  const sorted =
    active.includes('nearest') && withDistance
      ? [...withDistance].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
      : withDistance

  function toggle(id: FilterId) {
    setActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5 pb-4 border-b border-line">
        <div className="flex items-center gap-2">
          <BackButton fallback="/home" />
          <div className="flex-1 flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3">
            <i className="ph ph-magnifying-glass text-lg text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tailors, plumbers..."
              autoFocus={!category}
              className="flex-1 min-w-0 text-[15.5px] text-ink bg-transparent outline-none placeholder:text-muted-2"
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')} className="text-muted-2">
                <i className="ph-bold ph-x text-sm" />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {category && (
            <Chip active icon="x" onClick={() => setParams({})}>
              {category}
            </Chip>
          )}
          {FILTERS.map((f) => (
            <Chip key={f.id} active={active.includes(f.id)} onClick={() => toggle(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-[22px] pt-3.5 pb-6">
        {results.data && (
          <span className="text-sm text-muted">
            {results.data.length} pro{results.data.length === 1 ? '' : 's'}
            {category ? ` in ${category}` : ''}
          </span>
        )}
        {active.includes('nearest') && profile?.area == null && (
          <p className="mt-2 text-[13px] text-muted-2">
            Set your area in Settings and we can sort by who is closest to you.
          </p>
        )}
        <QueryState
          query={{ ...results, data: sorted }}
          errorMessage="We could not search right now."
          empty={{
            icon: 'ph-magnifying-glass',
            title: 'No matches',
            body: 'Try a different search, clear a filter, or post the job and let pros come to you.',
          }}
        >
          {(list) => list.map(({ provider, km }) => <ProviderCard key={provider.id} provider={provider} distanceKm={km} />)}
        </QueryState>
      </div>
    </Screen>
  )
}
