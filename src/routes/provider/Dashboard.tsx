import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function ProviderDashboard() {
  const requests = useAppStore((s) => s.providerRequests)
  const respondToRequest = useAppStore((s) => s.respondToRequest)
  const newRequests = requests.filter((r) => r.status === 'new')
  const focal = newRequests[0]

  return (
    <Screen bottomNav="provider">
      <div className="bg-ink px-[22px] pb-[22px]">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <div>
            <div className="text-[13.5px] text-muted-3">Selling as</div>
            <div className="font-display font-bold text-[19px] text-cream mt-0.5">Ada's Tailoring</div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 bg-ink-soft border border-ink-line rounded-full px-3 py-2 text-[12.5px] font-semibold text-cream">
              <span className="w-2 h-2 rounded-full bg-success" />
              Open
            </span>
            <Link to="/messages" className="inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-bell text-[22px]" />
            </Link>
          </div>
        </div>
        <Link to="/home" className="flex items-center justify-between bg-ink-soft border border-ink-line rounded-lg px-3.5 py-[11px] mt-4">
          <span className="flex items-center gap-2.5 text-[14.5px] font-semibold text-cream">
            <i className="ph-fill ph-arrows-left-right text-[17px] text-brand" />
            Switch to buying
          </span>
          <i className="ph-bold ph-arrow-right text-base text-muted-2" />
        </Link>
      </div>

      <div className="px-[22px] pt-[18px]">
        <div className="flex gap-3">
          <Link to="/provider/earnings" className="flex-1 bg-white border border-line rounded-2xl p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2">This week</div>
            <div className="font-display font-bold text-[22px] text-ink mt-1.5">₦86,400</div>
            <div className="flex items-center gap-1 mt-1.5">
              <i className="ph-fill ph-trend-up text-[13px] text-success" />
              <span className="text-xs text-success-text">18% up</span>
            </div>
          </Link>
          <Link to="/provider/requests" className="flex-1 bg-white border border-line rounded-2xl p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-2">To answer</div>
            <div className="font-display font-bold text-[22px] text-ink mt-1.5">{newRequests.length}</div>
            <div className="text-xs text-warning-text mt-1.5">{newRequests.length > 0 ? `${newRequests.length} pending` : 'All clear'}</div>
          </Link>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[22px] mb-2.5">Needs you now</div>
        {focal ? (
          <div className="bg-white border-[1.5px] border-brand rounded-2xl p-4">
            <div className="flex items-center justify-between">
              {focal.expiresIn ? (
                <Badge tone="warning" icon="clock">Expires in {focal.expiresIn}</Badge>
              ) : (
                <Badge tone="neutral">{focal.when}</Badge>
              )}
              <span className="font-display font-bold text-[17px] text-ink">{formatNaira(focal.price)}</span>
            </div>
            <div className="font-display font-semibold text-[16.5px] text-ink mt-3">Booking request · {focal.customer}</div>
            <div className="text-[13.5px] text-muted mt-1">{focal.service} · {focal.when}</div>
            <div className="flex gap-2.5 mt-3.5">
              <button
                onClick={() => respondToRequest(focal.id, true)}
                className="flex-1 flex items-center justify-center h-11 bg-success text-white rounded-lg text-[14.5px] font-semibold"
              >
                Accept
              </button>
              <button
                onClick={() => respondToRequest(focal.id, false)}
                className="flex-1 flex items-center justify-center h-11 border border-line rounded-lg text-[14.5px] font-semibold text-ink"
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-line rounded-2xl p-6 text-center text-sm text-muted">
            Nothing needs you right now.
          </div>
        )}

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[22px] mb-2.5">Shortcuts</div>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/provider/jobs" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-magnifying-glass text-[22px] text-brand" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">Find jobs</div>
            <div className="text-xs text-muted-2 mt-0.5">14 match you</div>
          </Link>
          <Link to="/provider/services" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-list-checks text-[22px] text-brand" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">My services</div>
            <div className="text-xs text-muted-2 mt-0.5">3 live</div>
          </Link>
          <Link to="/provider/availability" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-calendar-dots text-[22px] text-success" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">Availability</div>
            <div className="text-xs text-muted-2 mt-0.5">Open Mon–Sat</div>
          </Link>
          <Link to="/provider/earnings" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-wallet text-[22px] text-success" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">Payouts</div>
            <div className="text-xs text-muted-2 mt-0.5">₦34,000 due</div>
          </Link>
          <Link to="/courses" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-graduation-cap text-[22px] text-success" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">Learn & certify</div>
            <div className="text-xs text-muted-2 mt-0.5">Raise your trust score</div>
          </Link>
          <Link to="/plans" className="bg-white border border-line rounded-2xl p-4">
            <i className="ph-fill ph-crown text-[22px] text-brand" />
            <div className="text-[15px] font-semibold text-ink mt-2.5">Upgrade plan</div>
            <div className="text-xs text-muted-2 mt-0.5">Lower fees</div>
          </Link>
        </div>
      </div>
    </Screen>
  )
}
