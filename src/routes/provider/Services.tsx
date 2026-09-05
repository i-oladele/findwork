import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { myServices, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Services() {
  const serviceStatus = useAppStore((s) => s.serviceStatus)
  const toggleServiceStatus = useAppStore((s) => s.toggleServiceStatus)

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">My services</h2>
          <Link to="/provider" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        </div>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <i className="ph-fill ph-eye text-xl text-success" />
          <div className="flex-1 text-sm leading-[1.45] text-text-soft">
            Your listings were seen <strong className="text-ink">1,840 times</strong> this week and booked 12
            times.
          </div>
        </div>

        {myServices.map((s) => {
          const status = serviceStatus[s.id] ?? s.defaultStatus
          const live = status === 'live'
          return (
            <div key={s.id} className={`bg-white border border-line rounded-2xl overflow-hidden mt-4 ${live ? '' : 'opacity-[.72]'}`}>
              <div className="flex gap-3.5 p-3.5">
                <PlaceholderImage className="w-16 h-16 flex-none" />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-semibold text-base text-ink">{s.name}</span>
                    <span className="font-display font-bold text-base text-ink">{formatNaira(s.price)}</span>
                  </div>
                  <div className="text-[12.5px] text-muted-2 mt-1">{s.detail}</div>
                  <div className="flex items-center gap-2 mt-2">
                    {live ? (
                      <span className="inline-flex items-center gap-1.5 bg-success-bg text-success-text rounded-full px-2.5 py-1 text-[11px] font-bold">
                        <i className="ph-fill ph-check-circle" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-cream text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">
                        <i className="ph-fill ph-pause-circle" />
                        Paused
                      </span>
                    )}
                    {s.bookings > 0 && <span className="text-[11.5px] text-muted-2">{s.bookings} bookings</span>}
                  </div>
                </div>
              </div>
              <div className="flex border-t border-line-soft">
                <span className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-ink border-r border-line-soft">
                  <i className="ph ph-pencil-simple text-base" />
                  Edit
                </span>
                <button
                  onClick={() => toggleServiceStatus(s.id, s.defaultStatus)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-[46px] text-sm font-semibold text-muted"
                >
                  <i className={`ph ${live ? 'ph-pause' : 'ph-play'} text-base`} />
                  {live ? 'Pause' : 'Resume'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Screen>
  )
}
