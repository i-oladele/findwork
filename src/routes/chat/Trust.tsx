import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { useMyProviderProfile } from '../../lib/api'

const PROTECTIONS = [
  {
    icon: 'lock-simple',
    title: 'Escrow on every booking',
    body: 'Your money is held by FindWork until you confirm the job is done. Providers see it is there before they start.',
  },
  {
    icon: 'arrow-counter-clockwise',
    title: 'Full refund before the start time',
    body: 'If a provider declines, or either of you cancels before the job starts, the money comes straight back to your wallet.',
  },
  {
    icon: 'scales',
    title: 'Disputes freeze the money',
    body: 'Report a problem and the payment is held until a person on our team looks at both sides and decides.',
  },
  {
    icon: 'star',
    title: 'Reviews only from real customers',
    body: 'Only someone who booked, paid and confirmed a job can review it — one review per booking.',
  },
  {
    icon: 'flag',
    title: 'Report anything that feels wrong',
    body: 'Every profile, listing and message has a report button. Reports go to our moderators.',
  },
]

/**
 * How FindWork keeps people safe, plus — for providers — the signals that
 * customers see. These are the real stored facts; there is no composite
 * "trust score" formula yet, so none is shown.
 */
export function Trust() {
  const { data: provider } = useMyProviderProfile()

  return (
    <Screen>
      <PageHeader title="Safety and trust" back="/settings" />
      <div className="px-[22px] pb-8">
        {provider && (
          <>
            <SectionLabel className="mt-5 mb-2.5">What customers see about you</SectionLabel>
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              <Signal
                done={provider.verified}
                icon="shield-check"
                label={provider.verified ? 'Verified by FindWork' : 'Not yet verified'}
                action={provider.verified ? undefined : { to: '/get-verified', label: 'Get verified' }}
              />
              <Signal done={provider.jobs_done > 0} icon="briefcase" label={`${provider.jobs_done} job${provider.jobs_done === 1 ? '' : 's'} completed`} />
              <Signal
                done={provider.reviews > 0}
                icon="star"
                label={
                  provider.reviews > 0
                    ? `${Number(provider.rating).toFixed(1)} from ${provider.reviews} review${provider.reviews === 1 ? '' : 's'}`
                    : 'No reviews yet'
                }
                last
              />
            </div>
          </>
        )}

        <SectionLabel className="mt-6 mb-2.5">How you are protected</SectionLabel>
        <div className="space-y-2.5">
          {PROTECTIONS.map((p) => (
            <div key={p.title} className="flex gap-3.5 bg-white border border-line rounded-2xl p-4">
              <i className={`ph-fill ph-${p.icon} text-[22px] text-success`} />
              <div>
                <div className="text-[15px] font-semibold text-ink">{p.title}</div>
                <p className="mt-1 text-[13.5px] leading-[1.5] text-text-soft">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <Link to="/help" className="flex items-center justify-between bg-ink rounded-2xl px-5 py-4 mt-5">
          <span className="font-display font-semibold text-[16px] text-cream">Need help now?</span>
          <i className="ph-bold ph-arrow-right text-xl text-brand" />
        </Link>
      </div>
    </Screen>
  )
}

function Signal({
  done,
  icon,
  label,
  action,
  last,
}: {
  done: boolean
  icon: string
  label: string
  action?: { to: string; label: string }
  last?: boolean
}) {
  return (
    <div className={`flex items-center gap-3.5 p-[15px] ${last ? '' : 'border-b border-line-soft'}`}>
      <i className={`${done ? 'ph-fill text-success' : 'ph text-muted-4'} ph-${icon} text-[22px]`} />
      <span className="flex-1 text-[15px] font-semibold text-ink">{label}</span>
      {action && (
        <Link to={action.to} className="text-[14px] font-semibold text-brand-hover">
          {action.label}
        </Link>
      )}
    </div>
  )
}
