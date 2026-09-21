import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { ProgressDots } from '../../components/ui/ProgressDots'
import { Card } from '../../components/ui/Card'

export function ChooseRole() {
  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-[22px]">
        <ProgressDots step={2} of={3} />
        <h2 className="font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          What brings you here?
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          Pick one to start. You can add the other role any time from your profile.
        </p>

        <Card to="/home" active className="mt-6 p-[22px]">
          <i className="ph-fill ph-shopping-bag text-[28px] text-brand" />
          <div className="font-display font-semibold text-[19px] text-ink mt-3.5">I want to hire or buy</div>
          <p className="mt-1 text-[14.5px] leading-[1.5] text-muted">
            Book artisans and services, shop from vendors, track deliveries.
          </p>
        </Card>

        <Card to="/work-profile" className="mt-3 p-[22px]">
          <i className="ph-fill ph-briefcase text-[28px] text-ink" />
          <div className="font-display font-semibold text-[19px] text-ink mt-3.5">I want to work or sell</div>
          <p className="mt-1 text-[14.5px] leading-[1.5] text-muted">
            List services, bid on jobs, open a shop, get paid through escrow.
          </p>
        </Card>

        <Card to="/work-profile" className="mt-3 p-[22px]">
          <i className="ph-fill ph-arrows-left-right text-[28px] text-success" />
          <div className="font-display font-semibold text-[19px] text-ink mt-3.5">Both — I do a bit of each</div>
          <p className="mt-1 text-[14.5px] leading-[1.5] text-muted">
            One account, two modes. Switch between them from the home screen.
          </p>
        </Card>
      </div>
    </Screen>
  )
}
