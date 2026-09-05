import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { providers } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const days = [
  { d: 9, dim: true }, { d: 10 }, { d: 11 }, { d: 12 }, { d: 13 }, { d: 14, dim: true }, { d: 15, dim: true },
  { d: 16 }, { d: 17 }, { d: 18 }, { d: 19 }, { d: 20 }, { d: 21, dim: true }, { d: 22, dim: true },
]

const times = ['9:00', '11:30', '14:00', '15:30', '17:00', '18:30']

export function PickTime() {
  const { id } = useParams<{ id: string }>()
  const setDraftBooking = useAppStore((s) => s.setDraftBooking)
  const provider = providers.find((p) => p.id === id) ?? providers[0]
  const pkg = provider.packages?.[0]
  const [day, setDay] = useState(12)
  const [time, setTime] = useState('11:30')

  function continueToPay() {
    setDraftBooking({
      providerId: provider.id,
      providerName: provider.name,
      service: pkg?.name ?? `${provider.category} service`,
      price: pkg?.price ?? provider.price,
      date: `Thu ${day} Mar`,
      time,
    })
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to={`/provider/${provider.id}`} className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Book {provider.name}</span>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[18px] mb-2.5">Service</div>
        <div className="bg-white border border-line rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-semibold text-[16px] text-ink">{pkg?.name ?? provider.category}</span>
            <span className="font-display font-bold text-[16px] text-ink">₦{(pkg?.price ?? provider.price).toLocaleString()}</span>
          </div>
          <div className="text-[13.5px] text-muted mt-1">Change service</div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">March 2026</div>
        <div className="bg-white border border-line rounded-2xl p-4">
          <div className="grid grid-cols-7 gap-1.5 font-mono text-[10.5px] text-muted text-center mb-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {days.map((item) => (
              <button
                key={item.d}
                onClick={() => setDay(item.d)}
                className={`h-[38px] flex items-center justify-center rounded-lg text-[14.5px] ${
                  day === item.d
                    ? 'bg-brand text-white font-bold'
                    : item.dim
                      ? 'text-muted-4'
                      : 'text-ink'
                }`}
              >
                {item.d}
              </button>
            ))}
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Available times</div>
        <div className="grid grid-cols-3 gap-2.5">
          {times.map((t) => {
            const unavailable = t === '15:30'
            const active = t === time
            return (
              <button
                key={t}
                disabled={unavailable}
                onClick={() => setTime(t)}
                className={`h-12 flex items-center justify-center rounded-lg text-[15px] ${
                  unavailable
                    ? 'bg-line-soft text-muted line-through'
                    : active
                      ? 'bg-ink text-white font-semibold'
                      : 'bg-white border border-line text-ink font-medium'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-6">
        <Button to={`/book/${provider.id}/pay`} onClick={continueToPay}>Continue — Thu {day}, {time}</Button>
      </div>
    </Screen>
  )
}
