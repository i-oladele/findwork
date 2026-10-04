import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { canListen, listen, parseRole, speak } from '../../lib/voice'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { ProgressDots } from '../../components/ui/ProgressDots'
import { Card } from '../../components/ui/Card'
import { isAppPath } from '../../lib/destination'

export function ChooseRole() {
  // The link a new account arrived through, if any: hiring picks up there.
  const [params] = useSearchParams()
  const next = params.get('next')
  const navigate = useNavigate()
  const [hearing, setHearing] = useState(false)
  const [voiceNote, setVoiceNote] = useState<string | null>(null)

  // Reads the choices aloud, then listens for one of them.
  function chooseByVoice() {
    setVoiceNote(null)
    speak('What brings you here? Say hire, work, deliver, or business.', 'en')
    setHearing(true)
    // Give the prompt time to be spoken before the microphone opens.
    window.setTimeout(() => {
      listen('en').result.then(
        (said) => {
          const role = parseRole(said)
          if (!role) return setVoiceNote(`We heard "${said}". Say hire, work, deliver or business, or tap a card.`)
          navigate(role === '/home' && isAppPath(next) ? next : role)
        },
        (err: Error) => setVoiceNote(err.message),
      ).finally(() => setHearing(false))
    }, 3200)
  }

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
        {canListen() && (
          <>
            <button type="button" onClick={chooseByVoice} disabled={hearing}
              className="flex items-center gap-2.5 mt-4 min-h-11 text-[15px] font-semibold text-brand-hover">
              <i className={`ph-fill ${hearing ? 'ph-ear' : 'ph-microphone'} text-[19px]`} />
              {hearing ? 'Listening… say hire, work, deliver or business' : 'Choose by voice'}
            </button>
            {voiceNote && <p role="status" className="text-[13.5px] text-muted">{voiceNote}</p>}
          </>
        )}

        <Card to={isAppPath(next) ? next : '/home'} active className="mt-6 p-[22px]">
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

        <Card to="/procurement" className="mt-3 p-[22px]">
          <i className="ph-fill ph-buildings text-[28px] text-ink" />
          <div className="font-display font-semibold text-[19px] text-ink mt-3.5">I buy for a business</div>
          <p className="mt-1 text-[14.5px] leading-[1.5] text-muted">
            Request quotes in bulk, approve purchases as a team, pay suppliers through escrow.
          </p>
        </Card>

        <Card to="/rider" className="mt-3 p-[22px]">
          <i className="ph-fill ph-moped text-[28px] text-ink" />
          <div className="font-display font-semibold text-[19px] text-ink mt-3.5">I want to deliver</div>
          <p className="mt-1 text-[14.5px] leading-[1.5] text-muted">
            Collect orders from sellers, bring them to customers, get paid per delivery.
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
