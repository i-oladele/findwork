import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'

const categories = [
  { name: 'Tailoring', pros: 412, icon: 'scissors', color: 'text-brand' },
  { name: 'Plumbing', pros: 268, icon: 'wrench', color: 'text-brand' },
  { name: 'Electrical', pros: 190, icon: 'lightning', color: 'text-brand' },
  { name: 'Phone repair', pros: 154, icon: 'device-mobile', color: 'text-brand' },
  { name: 'Catering', pros: 331, icon: 'cooking-pot', color: 'text-success' },
  { name: 'Hair & beauty', pros: 507, icon: 'scissors', color: 'text-success' },
  { name: 'Cleaning', pros: 221, icon: 'broom', color: 'text-success' },
  { name: 'Carpentry', pros: 143, icon: 'hammer', color: 'text-success' },
]

export function Categories() {
  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <Link to="/home" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-2.5 font-display font-bold text-[30px] leading-[1.05] tracking-[-0.03em] text-ink">
          What do you need done?
        </h2>
        <div className="grid grid-cols-2 gap-3 mt-5">
          {categories.map((c) => (
            <Link key={c.name} to="/search" className="bg-white border border-line rounded-2xl p-[18px]">
              <i className={`ph-fill ph-${c.icon} text-[26px] ${c.color}`} />
              <div className="font-display font-semibold text-[16px] text-ink mt-3">{c.name}</div>
              <div className="text-[12.5px] text-muted-2 mt-0.5">{c.pros} pros</div>
            </Link>
          ))}
        </div>
        <Link to="/post-job" className="flex items-center justify-between bg-ink rounded-2xl px-5 py-[18px] mt-4">
          <div>
            <div className="font-display font-semibold text-[16.5px] text-cream">Not sure who to pick?</div>
            <div className="text-[13.5px] text-muted-3 mt-0.5">Post the job and let pros bid.</div>
          </div>
          <i className="ph-bold ph-arrow-right text-xl text-brand" />
        </Link>
      </div>
    </Screen>
  )
}
