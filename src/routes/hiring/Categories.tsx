import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { useProviderCategoryCounts } from '../../lib/api'
import { CATEGORIES } from '../../lib/categories'

export function Categories() {
  const { data: counts } = useProviderCategoryCounts()

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5 pb-8">
        <BackButton fallback="/home" />
        <h2 className="mt-2.5 font-display font-bold text-[30px] leading-[1.05] tracking-[-0.03em] text-ink">
          What do you need done?
        </h2>
        <div className="grid grid-cols-2 gap-3 mt-5">
          {CATEGORIES.map((c) => {
            const n = counts?.[c.name] ?? 0
            return (
              <Link
                key={c.name}
                to={`/search?category=${encodeURIComponent(c.name)}`}
                className="bg-white border border-line rounded-2xl p-[18px]"
              >
                <i className={`ph-fill ph-${c.icon} text-[26px] ${c.color}`} />
                <div className="font-display font-semibold text-[16px] text-ink mt-3">{c.name}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">
                  {counts ? (n === 0 ? 'No pros yet' : `${n} pro${n === 1 ? '' : 's'}`) : ' '}
                </div>
              </Link>
            )
          })}
        </div>
        <Link to="/post-job" className="flex items-center justify-between bg-ink rounded-2xl px-5 py-[18px] mt-4">
          <div>
            <div className="font-display font-semibold text-[16.5px] text-cream">Not sure who to pick?</div>
            <div className="text-[13.5px] text-muted-3 mt-0.5">Post the job and let pros quote.</div>
          </div>
          <i className="ph-bold ph-arrow-right text-xl text-brand" />
        </Link>
      </div>
    </Screen>
  )
}
