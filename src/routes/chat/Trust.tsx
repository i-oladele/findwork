import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Badge } from '../../components/ui/Badge'

const items = [
  { icon: 'identification-card', label: 'NIN verified', detail: 'Checked 4 March 2026', points: '+30', done: true },
  { icon: 'user-focus', label: 'Face matched to ID', detail: 'Checked 4 March 2026', points: '+20', done: true },
  { icon: 'briefcase', label: '486 jobs completed', detail: 'No cancellations in 90 days', points: '+25', done: true },
  { icon: 'star', label: '4.9 from 212 reviews', detail: 'Two disputes, both resolved', points: '+17', done: true },
  { icon: 'buildings', label: 'CAC business registration', detail: 'Not added — worth 8 points', done: false },
]

export function Trust() {
  return (
    <Screen>
      <div className="bg-ink px-[22px] pb-[26px]">
        <StatusBar tone="light" />
        <Link to="/home" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-cream">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <div className="flex items-center gap-[18px] mt-2.5">
          <div className="flex-none w-[88px] h-[88px] rounded-full border-[6px] border-success flex items-center justify-center">
            <span className="font-display font-bold text-[28px] text-cream">92</span>
          </div>
          <div>
            <div className="font-display font-bold text-2xl tracking-[-0.02em] text-cream">Trust score</div>
            <div className="mt-2">
              <Badge tone="success" icon="shield-check">Fully verified</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="px-[22px] pt-5">
        <p className="text-[15px] leading-[1.6] text-text-soft">
          Your score is built from verification, completed jobs, reviews and how you handle disputes. Customers
          see the badge, never the underlying documents.
        </p>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">What counts</div>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {items.map((item, i) => (
            <div key={item.label} className={`flex items-center gap-3.5 p-[15px] ${i < items.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <i className={`${item.done ? 'ph-fill' : 'ph'} ph-${item.icon} text-[22px] ${item.done ? 'text-success' : 'text-muted-4'}`} />
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{item.label}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{item.detail}</div>
              </div>
              {item.done ? (
                <span className="font-mono text-[11px] text-success-text">{item.points}</span>
              ) : (
                <i className="ph-bold ph-arrow-right text-[17px] text-brand" />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2.5 bg-white border border-line rounded-2xl p-4 mt-3.5">
          <i className="ph-fill ph-lock-simple text-[19px] text-muted-2 relative top-0.5" />
          <p className="m-0 text-[13.5px] leading-[1.5] text-text-soft">
            Documents are encrypted and only reviewed by our verification team. You can ask for them to be
            deleted at any time.
          </p>
        </div>
      </div>
    </Screen>
  )
}
