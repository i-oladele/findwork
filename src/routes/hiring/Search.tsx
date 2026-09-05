import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { Card } from '../../components/ui/Card'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { StarRating } from '../../components/ui/StarRating'
import { providers } from '../../data/mock'

const filterOptions = ['Under ₦15,000', 'Verified', '4.5+'] as const

export function Search() {
  const [query, setQuery] = useState('tailor')
  const [activeFilters, setActiveFilters] = useState<string[]>([])

  function toggleFilter(f: string) {
    setActiveFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
  }

  const results = providers.filter((p) => {
    const q = query.trim().toLowerCase()
    const matchesQuery = q === '' || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    if (!matchesQuery) return false
    if (activeFilters.includes('Under ₦15,000') && p.price >= 15000) return false
    if (activeFilters.includes('Verified') && !p.verified) return false
    if (activeFilters.includes('4.5+') && p.rating < 4.5) return false
    return true
  })

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5 pb-4 border-b border-line">
        <div className="flex items-center gap-2">
          <Link to="/home" className="inline-flex items-center justify-center w-10 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <div className="flex-1 flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3">
            <i className="ph ph-magnifying-glass text-lg text-muted-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tailors, plumbers..."
              className="flex-1 text-[15.5px] text-ink bg-transparent outline-none placeholder:text-muted-2"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto">
          <Chip active icon="sliders-horizontal">Filters</Chip>
          {filterOptions.map((f) => (
            <Chip key={f} active={activeFilters.includes(f)} onClick={() => toggleFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-[22px] pt-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">{results.length} pro{results.length === 1 ? '' : 's'} near Yaba</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            Best match <i className="ph-bold ph-caret-down text-xs" />
          </span>
        </div>

        {results.length === 0 && (
          <div className="bg-white border border-line rounded-2xl p-8 mt-3 text-center text-sm text-muted">
            No matches. Try a different search or clear filters.
          </div>
        )}

        {results.map((p, i) => (
          <Card key={p.id} to={`/provider/${p.id}`} active={i === 0} className="p-3.5 mt-3">
            <div className="flex gap-3.5">
              <PlaceholderImage className="w-16 h-16 flex-none" />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-[16px] text-ink">{p.name}</span>
                  <StarRating rating={p.rating} reviews={p.reviews} />
                </div>
                <div className="text-[13px] text-muted-2 mt-0.5">
                  {p.distanceKm} km · {p.repliesIn ? `replies in ${p.repliesIn}` : `from ₦${p.price.toLocaleString()}`}
                </div>
                <div className="flex gap-1.5 mt-2">
                  {p.verified ? <Badge tone="success" icon="shield-check">Verified</Badge> : <Badge tone="neutral">New</Badge>}
                  {p.topRated && <Badge tone="warning">Top rated</Badge>}
                </div>
              </div>
            </div>
            {i === 0 && (
              <div className="flex items-center gap-1.5 bg-danger-bg rounded-lg px-3 py-2.5 mt-3">
                <i className="ph-fill ph-sparkle text-sm text-brand-deep" />
                <span className="text-[12.5px] leading-[1.4] text-brand-deep-2">
                  Matched on your search and budget
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </Screen>
  )
}
