import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { PhotoPicker } from '../../components/ui/PhotoPicker'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useMyVerification, useProfile, useSubmitVerification } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import { formatPhone } from '../../lib/phone'
import type { VerificationIdType } from '../../lib/database.types'

const ID_TYPES: { type: VerificationIdType; label: string; field: string }[] = [
  { type: 'nin', label: 'NIN', field: 'Your 11-digit NIN' },
  { type: 'bvn', label: 'BVN', field: 'Your 11-digit BVN' },
  { type: 'passport', label: 'International passport', field: 'Passport number' },
  { type: 'drivers_licence', label: "Driver's licence", field: 'Licence number' },
  { type: 'voters_card', label: "Voter's card", field: 'VIN on your card' },
]

/**
 * Verifying an account: an ID and a selfie, checked by the FindWork team,
 * who approve or say what to fix. Reached from the notice on Home until the
 * account is verified. Automatic NIN/BVN checks through a KYC provider can
 * replace the manual review later without changing this screen much.
 */
export function GetVerified() {
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: latest, isLoading } = useMyVerification()

  if (profileLoading || isLoading) return <FullScreenLoader />

  const verified = Boolean(profile?.verified_at)
  const pending = !verified && latest?.status === 'pending'
  const rejected = !verified && latest?.status === 'rejected'
  const contact = user?.phone_confirmed_at
    ? `Confirmed ${formatPhone(`+${user.phone}`)}`
    : user?.email_confirmed_at
      ? `Confirmed ${user.email}`
      : 'Not confirmed yet'

  return (
    <Screen>
      <PageHeader title="Get verified" back="/home" />
      <div className="px-6 pt-3 pb-10">
        <p className="text-[15.5px] leading-[1.55] text-muted">
          Verify your identity to use every FindWork service. Our team checks your ID and lets you know.
        </p>

        <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
          <Step done={Boolean(user?.phone_confirmed_at || user?.email_confirmed_at)} icon="phone" label="Phone or email" detail={contact} />
          <Step
            done={verified}
            icon="identification-card"
            label="ID checked by FindWork"
            detail={verified ? 'Verified' : pending ? 'Being checked' : rejected ? 'Needs another look' : 'Send your ID below'}
            last
          />
        </div>

        {verified ? (
          <>
            <div className="mt-6 flex justify-center">
              <Badge tone="success" icon="shield-check">
                Verified
              </Badge>
            </div>
            <p className="mt-3 text-center text-[15px] text-muted">You can use every FindWork service.</p>
            <Button to="/home" className="mt-6 w-full">
              Back to home
            </Button>
          </>
        ) : pending ? (
          <>
            <Alert tone="info" className="mt-5">
              We are checking your ID, sent {formatDateTime(latest!.created_at)}. We will notify you as soon as it is
              done.
            </Alert>
            <Button to="/home" className="mt-6 w-full">
              Back to home
            </Button>
          </>
        ) : (
          <>
            {rejected && (
              <Alert className="mt-5">
                Your last submission needs another look: {latest!.note ?? 'please send it again.'} Send your ID again below.
              </Alert>
            )}
            <SubmitForm />
            <Link to="/home" className="block text-center mt-4 text-[15px] font-semibold text-muted">
              Do this later
            </Link>
          </>
        )}
      </div>
    </Screen>
  )
}

function SubmitForm() {
  const submit = useSubmitVerification()
  const [idType, setIdType] = useState<VerificationIdType>('nin')
  const [idNumber, setIdNumber] = useState('')
  const [document, setDocument] = useState<string[]>([])
  const [selfie, setSelfie] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const chosen = ID_TYPES.find((t) => t.type === idType)!
  const digitsOnly = idType === 'nin' || idType === 'bvn'
  const cleaned = idNumber.replace(/[\s-]/g, '')
  const numberValid = digitsOnly ? /^\d{11}$/.test(cleaned) : cleaned.length >= 5 && cleaned.length <= 30
  const canSend = numberValid && document.length === 1 && selfie.length === 1

  async function send() {
    setError(null)
    try {
      await submit.mutateAsync({ idType, idNumber: cleaned, documentPath: document[0], selfiePath: selfie[0] })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <>
      <SectionLabel className="mt-6 mb-2.5">ID type</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {ID_TYPES.map((t) => (
          <Chip key={t.type} active={idType === t.type} icon={idType === t.type ? 'check' : undefined} onClick={() => setIdType(t.type)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="mt-5">
        <Input
          label={chosen.field}
          value={idNumber}
          onChange={setIdNumber}
          type={digitsOnly ? 'tel' : 'text'}
          placeholder={digitsOnly ? '12345678901' : undefined}
          autoCapitalize="none"
          hint={digitsOnly && cleaned.length > 0 && !numberValid ? 'It should be 11 digits.' : undefined}
        />
      </div>

      <SectionLabel className="mt-5 mb-1.5">Photo of your {chosen.label === 'NIN' || chosen.label === 'BVN' ? 'ID card or slip' : chosen.label.toLowerCase()}</SectionLabel>
      <p className="mb-2.5 text-[13px] text-muted-2">The whole document, in focus, with nothing covered.</p>
      <PhotoPicker bucket="verification-documents" value={document} onChange={setDocument} onError={setError} max={1} />

      <SectionLabel className="mt-5 mb-1.5">A selfie</SectionLabel>
      <p className="mb-2.5 text-[13px] text-muted-2">Your face, in good light, looking at the camera.</p>
      <PhotoPicker bucket="verification-documents" value={selfie} onChange={setSelfie} onError={setError} max={1} capture="user" />

      <div className="flex items-start gap-2.5 mt-5">
        <i className="ph-fill ph-lock-simple text-[17px] text-muted-2 relative top-0.5" />
        <p className="text-[13.5px] leading-[1.5] text-muted">
          Only the FindWork team sees these, only to confirm who you are. They are never shown to anyone else.
        </p>
      </div>

      {error && <Alert className="mt-4">{error}</Alert>}

      <Button onClick={send} disabled={!canSend} loading={submit.isPending} className="mt-6 w-full">
        Send for checking
      </Button>
    </>
  )
}

function Step({
  done,
  icon,
  label,
  detail,
  last,
}: {
  done: boolean
  icon: string
  label: string
  detail: string
  last?: boolean
}) {
  return (
    <div className={`flex items-center gap-3.5 px-5 py-[17px] ${last ? '' : 'border-b border-line-soft'}`}>
      <i className={`${done ? 'ph-fill ph-check-circle text-success' : `ph ph-${icon} text-ink`} text-2xl`} />
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-semibold text-ink">{label}</div>
        <div className="text-[13.5px] text-muted-2 mt-0.5 truncate">{detail}</div>
      </div>
      {done && <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-success-text">Done</span>}
    </div>
  )
}
