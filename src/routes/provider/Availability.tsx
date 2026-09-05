import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { useAppStore } from '../../store/appStore'

const hoursFor: Record<string, string> = {
  Monday: '09:00 – 18:00',
  Tuesday: '09:00 – 18:00',
  Wednesday: '09:00 – 18:00',
  Thursday: '09:00 – 20:00',
  Friday: '09:00 – 20:00',
  Saturday: '10:00 – 16:00',
  Sunday: 'Closed',
}
const dayOrder = Object.keys(hoursFor)

function Toggle({ on, size = 'md' }: { on: boolean; size?: 'md' | 'sm' }) {
  const w = size === 'md' ? 'w-[52px] h-[30px]' : 'w-11 h-[26px]'
  const knob = size === 'md' ? 'w-6 h-6' : 'w-5 h-5'
  return (
    <span
      className={`flex-none ${w} rounded-full flex items-center p-[3px] ${
        on ? 'bg-success justify-end' : 'bg-line'
      }`}
    >
      <span className={`${knob} rounded-full bg-white`} />
    </span>
  )
}

export function Availability() {
  const availability = useAppStore((s) => s.availability)
  const setTaking = useAppStore((s) => s.setTaking)
  const toggleDay = useAppStore((s) => s.toggleDay)

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/provider" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Availability</span>
        </div>

        <button
          onClick={() => setTaking(!availability.taking)}
          className="w-full flex items-center justify-between bg-white border border-line rounded-2xl p-4 mt-4 text-left"
        >
          <div>
            <div className="font-display font-semibold text-[16.5px] text-ink">Taking bookings</div>
            <div className="text-[13px] text-muted-2 mt-1">Customers can book you right now</div>
          </div>
          <Toggle on={availability.taking} />
        </button>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[22px] mb-2.5">Weekly hours</div>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {dayOrder.map((day, i) => {
            const open = availability.days[day]
            return (
              <div
                key={day}
                className={`flex items-center justify-between px-4 py-3.5 ${i < dayOrder.length - 1 ? 'border-b border-line-soft' : ''}`}
              >
                <span className={`text-[15px] font-semibold w-[88px] ${open ? 'text-ink' : 'text-muted-4'}`}>{day}</span>
                <span className={`flex-1 text-[14.5px] ${open ? 'text-text-soft' : 'text-muted'}`}>
                  {open ? hoursFor[day] : 'Closed'}
                </span>
                <button onClick={() => toggleDay(day)}>
                  <Toggle on={open} size="sm" />
                </button>
              </div>
            )
          })}
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-[22px] mb-2.5">Time off</div>
        <div className="flex items-center gap-3 bg-white border-[1.5px] border-dashed border-[#C9A99E] rounded-2xl p-4">
          <i className="ph ph-calendar-x text-xl text-brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-ink">Block out days</div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">Travel, holidays, family events</div>
          </div>
          <i className="ph-bold ph-plus text-lg text-brand" />
        </div>
      </div>
    </Screen>
  )
}
