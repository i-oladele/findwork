import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'
import { useAppStore } from '../../store/appStore'

export function Disputes() {
  const disputes = useAppStore((s) => s.disputes)

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/wallet" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">My disputes</span>
        </div>

        {disputes.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center text-sm text-muted">
            No disputes open. If something's wrong with an order or booking, you can open one from its details screen.
          </div>
        ) : (
          disputes.map((d) => (
            <Link key={d.id} to={`/disputes/new/${d.refId}`} className="block bg-white border border-line rounded-2xl p-4 mt-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-2">
                  {d.refType === 'order' ? 'Order' : 'Booking'} {d.refId}
                </span>
                {d.status === 'open' ? (
                  <Badge tone="warning" icon="clock">Under review</Badge>
                ) : (
                  <Badge tone="success" icon="check-circle">Resolved</Badge>
                )}
              </div>
              <p className="mt-2.5 text-[14.5px] leading-[1.5] text-ink">{d.reason}</p>
              <div className="text-[12.5px] text-muted-2 mt-1.5">Opened {d.openedAt}</div>
            </Link>
          ))
        )}
      </div>
    </Screen>
  )
}
