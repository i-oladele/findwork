import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Chip } from '../../components/ui/Chip'
import { StarRating } from '../../components/ui/StarRating'
import { openJobs, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const others = [
  { name: 'Bisi Couture', price: 58500, rating: 4.8, distance: '2.1 km', ready: 'ready in 7 days' },
  { name: 'Mama Nkechi Styles', price: 46000, rating: 4.6, distance: '3.4 km', ready: 'ready in 12 days' },
]

const seedJob = openJobs.find((j) => j.id === 'aso-ebi-dresses')!

export function Quotes() {
  const navigate = useNavigate()
  const jobsPosted = useAppStore((s) => s.jobsPosted)
  const lastJobId = useAppStore((s) => s.lastJobId)
  const setDraftBooking = useAppStore((s) => s.setDraftBooking)

  const postedJob = jobsPosted.find((j) => j.id === lastJobId)
  const title = postedJob?.title ?? seedJob.title
  const budget = postedJob?.budget ?? seedJob.price
  const topQuotePrice = Math.round(budget * 0.9)

  function acceptTopQuote() {
    setDraftBooking({
      providerId: 'ada-tailoring',
      providerName: "Ada's Tailoring",
      service: title,
      price: topQuotePrice,
      date: 'Fri 21 Mar',
      time: '18:00',
    })
    navigate('/book/ada-tailoring/pay')
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/bookings" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">{title}</span>
        </div>

        <div className="flex items-center gap-2.5 mt-3">
          <span className="font-display font-bold text-[26px] text-ink">7 quotes</span>
          <span className="text-sm text-muted">Budget {formatNaira(budget)} · closes in 2 days</span>
        </div>

        <div className="flex gap-2 mt-3.5">
          <Chip active>Best match</Chip>
          <Chip>Lowest price</Chip>
          <Chip>Fastest</Chip>
        </div>

        <Card active className="p-4 mt-4">
          <div className="flex gap-3.5">
            <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="font-display font-semibold text-[16px] text-ink">Ada's Tailoring</span>
                <span className="font-display font-bold text-[17px] text-ink">{formatNaira(topQuotePrice)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <StarRating rating={4.9} />
                <span className="text-[12.5px] text-muted-2">· 1.2 km · ready in 9 days</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[14.5px] leading-[1.5] text-text-soft">
            "I have done work like this many times. I can come for measurements Friday evening."
          </p>
          <div className="flex gap-2.5 mt-3.5">
            <button
              onClick={acceptTopQuote}
              className="flex-1 flex items-center justify-center h-[46px] bg-brand text-white rounded-lg text-[15px] font-semibold"
            >
              Accept quote
            </button>
            <Link
              to="/chat/ada-tailoring"
              className="flex-none flex items-center justify-center w-[46px] h-[46px] border border-line rounded-lg text-ink"
            >
              <i className="ph ph-chat-circle-dots text-[19px]" />
            </Link>
          </div>
        </Card>

        {others.map((o) => (
          <Card key={o.name} className="p-4 mt-3">
            <div className="flex gap-3.5">
              <PlaceholderImage className="w-[52px] h-[52px] flex-none" />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-[16px] text-ink">{o.name}</span>
                  <span className="font-display font-bold text-[17px] text-ink">₦{o.price.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating rating={o.rating} />
                  <span className="text-[12.5px] text-muted-2">· {o.distance} · {o.ready}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}
