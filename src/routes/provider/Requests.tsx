import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

const tabs = ['New', 'Accepted', 'Done'] as const

export function Requests() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('New')
  const requests = useAppStore((s) => s.providerRequests)
  const respondToRequest = useAppStore((s) => s.respondToRequest)
  const newCount = requests.filter((r) => r.status === 'new').length

  const filtered = requests.filter((r) => {
    if (tab === 'New') return r.status === 'new'
    if (tab === 'Accepted') return r.status === 'accepted'
    return false
  })

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5">
        <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Requests</h2>
        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-3.5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md text-[14.5px] ${
                tab === t ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
              }`}
            >
              {t}
              {t === 'New' && newCount > 0 && (
                <span className="min-w-[19px] h-[19px] rounded-full bg-brand text-white font-mono text-[10.5px] flex items-center justify-center">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="bg-white border border-line rounded-2xl p-8 mt-4 text-center text-sm text-muted">
            Nothing here.
          </div>
        )}

        {filtered.map((r, i) => (
          <div key={r.id} className={i === 0 && tab === 'New' ? 'bg-white border-[1.5px] border-brand rounded-2xl p-4 mt-4' : 'bg-white border border-line rounded-2xl p-4 mt-3'}>
            <div className="flex items-center justify-between">
              {r.expiresIn ? (
                <Badge tone="warning" icon="clock">Expires in {r.expiresIn}</Badge>
              ) : (
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-2">{r.when}</span>
              )}
              <span className="font-display font-bold text-[17px] text-ink">{formatNaira(r.price)}</span>
            </div>
            <div className="flex gap-3 mt-3.5">
              <PlaceholderImage shape="circle" className="w-12 h-12 flex-none" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-semibold text-base text-ink">{r.customer}</span>
                  {r.rating && <i className="ph-fill ph-shield-check text-sm text-success" />}
                </div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">
                  {r.rating ? `${r.rating} · ${r.bookingsCount} bookings · ${r.location}` : r.service}
                </div>
              </div>
            </div>
            {tab === 'New' && (
              <>
                <div className="bg-cream rounded-xl p-3.5 mt-3.5">
                  <div className="flex items-center gap-2.5">
                    <i className="ph ph-scissors text-lg text-brand" />
                    <span className="text-[14.5px] text-ink">{r.service}</span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-2.5">
                    <i className="ph ph-calendar-dots text-lg text-brand" />
                    <span className="text-[14.5px] text-ink">{r.when}</span>
                  </div>
                  {r.escrowHeld > 0 && (
                    <div className="flex items-center gap-2.5 mt-2.5">
                      <i className="ph-fill ph-lock-simple text-lg text-success" />
                      <span className="text-[14.5px] text-ink">{formatNaira(r.escrowHeld)} already in escrow</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2.5 mt-3.5">
                  <button
                    onClick={() => respondToRequest(r.id, true)}
                    className="flex-1 flex items-center justify-center h-12 bg-success text-white rounded-lg text-[15px] font-semibold"
                  >
                    Accept booking
                  </button>
                  <Link to="/chat/ada-tailoring" className="flex-none flex items-center justify-center w-12 h-12 border border-line rounded-lg text-ink">
                    <i className="ph ph-chat-circle-dots text-lg" />
                  </Link>
                </div>
                <button
                  onClick={() => respondToRequest(r.id, false)}
                  className="flex items-center justify-center w-full h-11 mt-1.5 text-[15px] font-semibold text-muted"
                >
                  Decline
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </Screen>
  )
}
