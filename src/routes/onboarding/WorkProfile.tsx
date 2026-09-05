import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { ProgressDots } from '../../components/ui/ProgressDots'

const categories = ['Tailoring', 'Fashion design', 'Plumbing', 'Phone repair', 'Catering', 'Hair & beauty', 'Cleaning', 'Electrical']

export function WorkProfile() {
  const [selected, setSelected] = useState<string[]>(['Tailoring'])
  const [location, setLocation] = useState('Yaba, Lagos')
  const [price, setPrice] = useState('12,000')

  function toggle(cat: string) {
    setSelected((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat)
      if (prev.length >= 3) return prev
      return [...prev, cat]
    })
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-[22px]">
        <ProgressDots step={3} of={3} />
        <h2 className="font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          What do you do?
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          Choose up to three. This is how customers find you.
        </p>

        <div className="flex flex-wrap gap-2.5 mt-[22px]">
          {categories.map((cat) => (
            <Chip key={cat} active={selected.includes(cat)} icon={selected.includes(cat) ? 'check' : undefined} onClick={() => toggle(cat)}>
              {cat}
            </Chip>
          ))}
        </div>

        <div className="mt-[26px]">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Where you work</div>
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
            <i className="ph ph-map-pin text-[19px] text-brand" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 text-[16px] text-ink bg-transparent outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Starting price</div>
          <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
            <span className="font-display font-bold text-[16px] text-ink">₦</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="w-24 text-[16px] font-display font-bold text-ink bg-transparent outline-none"
            />
            <span className="text-[14.5px] text-muted-2">per job</span>
          </div>
        </div>

        <Button to="/get-verified" className="mt-[26px]">
          Continue to verification
        </Button>
      </div>
    </Screen>
  )
}
