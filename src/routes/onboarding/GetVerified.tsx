import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/appStore'

export function GetVerified() {
  const profile = useAppStore((s) => s.profile)
  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-3.5">
        <h2 className="font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          Get verified
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          Verified providers win about three times more jobs. Each step raises your trust score.
        </p>

        <div className="flex items-center gap-4 bg-ink rounded-2xl p-5 mt-[22px]">
          <div className="flex-none w-[62px] h-[62px] rounded-full border-[5px] border-brand flex items-center justify-center font-display font-bold text-[19px] text-cream">
            42
          </div>
          <div>
            <div className="font-display font-semibold text-[17px] text-cream">Trust score</div>
            <p className="mt-0.5 text-sm leading-[1.45] text-muted-3">
              Finish the two open steps to reach 80 and earn the Verified badge.
            </p>
          </div>
        </div>

        <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3.5 px-5 py-[17px] border-b border-line-soft">
            <i className="ph-fill ph-check-circle text-2xl text-success" />
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-ink">Phone number</div>
              <div className="text-[13.5px] text-muted-2 mt-0.5">Confirmed by SMS</div>
            </div>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-success-text">Done</span>
          </div>
          <div className="flex items-center gap-3.5 px-5 py-[17px] border-b border-line-soft">
            <i className="ph-fill ph-check-circle text-2xl text-success" />
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-ink">Email address</div>
              <div className="text-[13.5px] text-muted-2 mt-0.5">{profile.email}</div>
            </div>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-success-text">Done</span>
          </div>
          <Link to="/trust" className="flex items-center gap-3.5 px-5 py-[17px] border-b border-line-soft">
            <i className="ph ph-identification-card text-2xl text-ink" />
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-ink">NIN or BVN</div>
              <div className="text-[13.5px] text-muted-2 mt-0.5">Takes about two minutes</div>
            </div>
            <i className="ph-bold ph-arrow-right text-lg text-brand" />
          </Link>
          <Link to="/trust" className="flex items-center gap-3.5 px-5 py-[17px]">
            <i className="ph ph-user-focus text-2xl text-ink" />
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-ink">Face check</div>
              <div className="text-[13.5px] text-muted-2 mt-0.5">A quick selfie, matched to your ID</div>
            </div>
            <i className="ph-bold ph-arrow-right text-lg text-brand" />
          </Link>
        </div>

        <div className="flex items-start gap-2.5 mt-[18px]">
          <i className="ph-fill ph-lock-simple text-[17px] text-muted-2 relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-muted">
            Your ID is used once to confirm who you are, then stored encrypted. It is never shown to customers.
          </p>
        </div>

        <Button to="/home" className="mt-[22px]">
          Verify my identity
        </Button>
        <Button to="/home" variant="ghost" className="mt-1.5 w-full">
          Do this later
        </Button>
      </div>
    </Screen>
  )
}
