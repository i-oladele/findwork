import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { useAuth } from '../../lib/authContext'
import { useCreateSupportRequest, useMyProviderProfile, useMySupportRequests } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'

const REQUEST_TEXT = 'Please verify my provider profile.'

/**
 * Verification is done by the FindWork team for now: a provider asks, an
 * admin checks them and switches on the Verified badge. Automated NIN/BVN
 * and face checks need a KYC vendor (Smile ID, Dojah, Prembly…) that has
 * not been chosen yet, so they are shown as coming rather than faked.
 */
export function GetVerified() {
  const { user } = useAuth()
  const { data: provider } = useMyProviderProfile()
  const { data: requests } = useMySupportRequests()
  const createRequest = useCreateSupportRequest()
  const [error, setError] = useState<string | null>(null)

  const phoneConfirmed = Boolean(user?.phone_confirmed_at)
  const emailConfirmed = Boolean(user?.email_confirmed_at)
  const requested = requests?.some((r) => r.status === 'open' && r.message === REQUEST_TEXT)

  async function requestReview() {
    setError(null)
    try {
      await createRequest.mutateAsync({ topic: 'account', message: REQUEST_TEXT })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Get verified" back="/settings" />
      <div className="px-6 pt-3 pb-10">
        <p className="text-[15.5px] leading-[1.55] text-muted">
          Verified providers show a badge customers look for. Each step below is checked by FindWork, never
          self-declared.
        </p>

        <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
          <Step
            done={phoneConfirmed}
            icon="phone"
            label="Phone number"
            detail={phoneConfirmed ? `Confirmed ${user?.phone ? `+${user.phone}` : ''}` : 'Not added — sign up with your phone to confirm it'}
          />
          <Step
            done={emailConfirmed}
            icon="envelope-simple"
            label="Email address"
            detail={emailConfirmed ? user?.email ?? 'Confirmed' : 'Not confirmed'}
          />
          <Step
            done={Boolean(provider?.verified)}
            icon="identification-card"
            label="Checked by FindWork"
            detail={
              provider?.verified
                ? 'You have the Verified badge'
                : provider
                  ? requested
                    ? 'Requested — our team will be in touch'
                    : 'Ask our team to check your details'
                  : 'Set up your provider profile first'
            }
          />
          <Step done={false} icon="user-focus" label="NIN and face check" detail="Coming soon" last muted />
        </div>

        <div className="flex items-start gap-2.5 mt-[18px]">
          <i className="ph-fill ph-lock-simple text-[17px] text-muted-2 relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-muted">
            Anything you send us to check is used only to confirm who you are, and never shown to customers.
          </p>
        </div>

        {error && <Alert className="mt-4">{error}</Alert>}

        {!provider ? (
          <Button to="/work-profile" className="mt-6 w-full">
            Set up your provider profile
          </Button>
        ) : provider.verified ? (
          <div className="mt-6 flex justify-center">
            <Badge tone="success" icon="shield-check">
              Verified
            </Badge>
          </div>
        ) : requested ? (
          <Button to="/help" variant="secondary" className="mt-6 w-full text-ink">
            See my request
          </Button>
        ) : (
          <Button onClick={requestReview} loading={createRequest.isPending} className="mt-6 w-full">
            Ask FindWork to verify me
          </Button>
        )}
        <Link to="/home" className="block text-center mt-4 text-[15px] font-semibold text-muted">
          Do this later
        </Link>
      </div>
    </Screen>
  )
}

function Step({
  done,
  icon,
  label,
  detail,
  last,
  muted,
}: {
  done: boolean
  icon: string
  label: string
  detail: string
  last?: boolean
  muted?: boolean
}) {
  return (
    <div className={`flex items-center gap-3.5 px-5 py-[17px] ${last ? '' : 'border-b border-line-soft'}`}>
      <i
        className={`${done ? 'ph-fill ph-check-circle text-success' : `ph ph-${icon} ${muted ? 'text-muted-4' : 'text-ink'}`} text-2xl`}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-[16px] font-semibold ${muted ? 'text-muted-4' : 'text-ink'}`}>{label}</div>
        <div className="text-[13.5px] text-muted-2 mt-0.5 truncate">{detail}</div>
      </div>
      {done && <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-success-text">Done</span>}
    </div>
  )
}
