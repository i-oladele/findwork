import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { classifiedsCatalog, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const cats = ['All', 'Rentals', 'Used goods'] as const

export function Classifieds() {
  const [cat, setCat] = useState<(typeof cats)[number]>('All')
  const myAds = useAppStore((s) => s.classifieds)

  const all = [
    ...myAds.map((a) => ({ ...a, distanceKm: 0, seller: 'You', verified: true, mine: true as const })),
    ...classifiedsCatalog.map((c) => ({ ...c, mine: false as const })),
  ]
  const filtered = cat === 'All' ? all : all.filter((a) => a.category === cat)

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Classifieds</h2>
          <Link to="/classifieds/new" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>
        <p className="mt-1.5 text-[14px] text-muted">Rentals and used goods near you, from other users — not vendor stock.</p>

        <div className="flex gap-2 mt-3.5">
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {filtered.map((ad) => (
            <Link key={ad.id} to={`/classifieds/${ad.id}`} className="bg-white border border-line rounded-2xl overflow-hidden">
              <PlaceholderImage className="h-[100px] w-full rounded-none" />
              <div className="px-3 py-2.5">
                <div className="text-[14.5px] font-semibold text-ink leading-[1.3]">{ad.title}</div>
                <div className="font-display font-bold text-base text-ink mt-1.5">
                  {formatNaira(ad.price)}
                  {ad.category === 'Rentals' && <span className="text-xs font-normal text-muted-2">/yr</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <i className="ph ph-map-pin text-xs text-muted-2" />
                  <span className="text-[11.5px] text-muted">{ad.location}</span>
                  {ad.mine && <span className="text-[10.5px] font-semibold text-brand-hover ml-auto">Yours</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Screen>
  )
}
