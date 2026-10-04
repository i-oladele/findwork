import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { QueryState } from '../../components/system/QueryState'
import {
  useDevices,
  useMfaFactors,
  useNewRecoveryCodes,
  useRemoveMfa,
  useRemoveTrustedContact,
  useSaveTrustedContact,
  useTrustedContacts,
  useSecurityEvents,
  useStartMfaEnrolment,
  useVerifyMfa,
  type MfaEnrolment,
} from '../../lib/api'
import { deviceId } from '../../lib/device'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { DEFAULT_COUNTRY, isPhoneNumber, toE164, type PhoneValue } from '../../lib/phone'
import { Input } from '../../components/ui/Input'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import type { SecurityEventKind } from '../../lib/database.types'

const EVENT_LABEL: Record<SecurityEventKind, string> = {
  sign_in: 'Signed in',
  new_device: 'Signed in on a new device',
  mfa_enrolled: 'Two-step sign-in turned on',
  mfa_removed: 'Two-step sign-in turned off',
  mfa_recovered: 'Recovery code used',
  suspended: 'Account suspended',
  reinstated: 'Account reinstated',
  role_changed: 'Staff role changed',
  sos: 'SOS alert sent',
}

export function Security() {
  return (
    <Screen>
      <PageHeader title="Sign-in and security" back="/settings" />
      <div className="px-[22px] pb-10">
        <TwoStep />
        <SectionLabel className="mt-7 mb-2.5">Trusted contacts</SectionLabel>
        <TrustedContacts />
        <SectionLabel className="mt-7 mb-2.5">Devices signed in to your account</SectionLabel>
        <Devices />
        <SectionLabel className="mt-7 mb-2.5">Recent activity</SectionLabel>
        <Activity />
      </div>
    </Screen>
  )
}

function TwoStep() {
  const factors = useMfaFactors()
  const start = useStartMfaEnrolment()
  const verify = useVerifyMfa()
  const remove = useRemoveMfa()
  const renew = useNewRecoveryCodes()
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const factor = factors.data?.[0]
  const pending = start.isPending || verify.isPending || remove.isPending || renew.isPending

  async function run(action: () => Promise<void>) {
    setError(null)
    try { await action() } catch (err) { setError(friendlyError(err)) }
  }

  return (
    <div className="mt-4 bg-white border border-line rounded-2xl p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display font-semibold text-[16.5px] text-ink">Two-step sign-in</div>
        {factor ? <Badge tone="success" icon="check-circle">On</Badge> : <Badge tone="neutral">Off</Badge>}
      </div>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-muted">
        After your password, FindWork asks for a 6-digit code from an authenticator app such as Google Authenticator or Authy.
        Someone who learns your password still cannot reach your wallet.
      </p>

      {codes && (
        <Alert tone="info" className="mt-4">
          <div className="font-semibold text-ink">Save these recovery codes now</div>
          <p className="mt-1">Each works once if you lose your phone. They are not shown again.</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[14px] text-ink">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button className="mt-2 min-h-11 font-semibold text-brand" onClick={() => setCodes(null)}>I have saved them</button>
        </Alert>
      )}

      {!factors.isLoading && !factor && !enrolment && (
        <Button className="mt-4" loading={start.isPending} onClick={() => run(async () => { setEnrolment(await start.mutateAsync()); setCode('') })}>
          Turn on two-step sign-in
        </Button>
      )}

      {enrolment && (
        <form className="mt-4" onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const issued = await verify.mutateAsync({ factorId: enrolment.factorId, code, issueRecoveryCodes: true })
            setCodes(issued)
            setEnrolment(null)
            await factors.refetch()
          })
        }}>
          <p className="text-[14px] leading-[1.5] text-text-soft">1. Scan this with your authenticator app, or type the key in by hand.</p>
          <img src={enrolment.qr} alt="QR code for your authenticator app" className="mt-3 w-44 h-44 bg-white" />
          <p className="mt-2 font-mono text-[13px] break-all text-ink">{enrolment.secret}</p>
          <label className="block mt-4 text-[14px] text-text-soft">2. Enter the 6-digit code it shows
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
              className="block w-full mt-2 bg-cream rounded-lg h-[52px] px-3.5 font-display font-bold text-xl tracking-[0.12em] text-ink outline-none" />
          </label>
          <Button type="submit" className="mt-4" disabled={code.replace(/\D/g, '').length !== 6} loading={verify.isPending}>Confirm and turn on</Button>
          <button type="button" disabled={pending} className="mt-2 min-h-11 text-[14px] text-muted" onClick={() => setEnrolment(null)}>Cancel</button>
        </form>
      )}

      {factor && !codes && (
        <div className="flex gap-5 mt-3 text-[14px] font-semibold">
          <button disabled={pending} className="min-h-11 text-brand" onClick={() => {
            if (window.confirm('Make new recovery codes? Your old ones stop working.')) void run(async () => setCodes(await renew.mutateAsync()))
          }}>New recovery codes</button>
          <button disabled={pending} className="min-h-11 text-danger" onClick={() => {
            if (window.confirm('Turn off two-step sign-in? Your password alone will open your account.')) void run(() => remove.mutateAsync(factor.id))
          }}>Turn off</button>
        </div>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  )
}

function Devices() {
  const devices = useDevices()
  const here = deviceId()
  return (
    <QueryState query={devices} errorMessage="We could not load your devices." skeletonRows={2} empty={{ icon: 'ph-device-mobile', title: 'No devices recorded yet' }}>
      {(rows) => (
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {rows.map((d, i) => (
            <div key={d.device_id} className={`px-4 py-3.5 ${i < rows.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{d.label || 'Unknown device'}</span>
                {d.device_id === here && <Badge tone="success">This device</Badge>}
              </div>
              <div className="text-[12.5px] text-muted-2 mt-0.5">Last used {formatDateTime(d.last_seen_at)} · first seen {formatDateTime(d.first_seen_at)}</div>
            </div>
          ))}
        </div>
      )}
    </QueryState>
  )
}

function Activity() {
  const events = useSecurityEvents()
  return (
    <QueryState query={events} errorMessage="We could not load your recent activity." skeletonRows={2} empty={{ icon: 'ph-clock-counter-clockwise', title: 'Nothing recorded yet' }}>
      {(rows) => (
        <ul className="bg-white border border-line rounded-2xl overflow-hidden">
          {rows.map((e, i) => (
            <li key={e.id} className={`px-4 py-3 text-[14px] ${i < rows.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <div className="text-ink">{EVENT_LABEL[e.kind] ?? e.kind}</div>
              <div className="text-[12.5px] text-muted-2">{formatDateTime(e.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  )
}

/** Up to three people you can text or call in one tap from a meet-up or the SOS button. */
function TrustedContacts() {
  const contacts = useTrustedContacts()
  const save = useSaveTrustedContact()
  const remove = useRemoveTrustedContact()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState<PhoneValue>({ country: DEFAULT_COUNTRY, number: '' })
  const [error, setError] = useState<string | null>(null)
  const count = contacts.data?.length ?? 0

  return (
    <div className="bg-white border border-line rounded-2xl p-4">
      <p className="text-[14px] leading-[1.5] text-muted">People you trust. From a meet-up you can text them where you are, or ask them for help, in one tap.</p>
      {contacts.data?.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 border-t border-line-soft mt-3 pt-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink truncate">{c.name}</div>
            <div className="text-[13px] text-muted-2">{c.phone}</div>
          </div>
          <button disabled={remove.isPending} className="min-h-11 text-[14px] font-semibold text-muted" onClick={() => { setError(null); remove.mutate(c.id, { onError: (e) => setError(friendlyError(e)) }) }}>Remove</button>
        </div>
      ))}
      {count < 3 && (
        <form className="border-t border-line-soft mt-3 pt-3 space-y-3" onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          save.mutate({ name: name.trim(), phone: toE164(phone) }, { onSuccess: () => { setName(''); setPhone({ country: DEFAULT_COUNTRY, number: '' }) }, onError: (err) => setError(friendlyError(err)) })
        }}>
          <Input label="Name" value={name} onChange={setName} autoCapitalize="words" />
          <PhoneInput value={phone} onChange={setPhone} />
          <Button type="submit" variant="secondary" className="h-12 text-ink" disabled={!name.trim() || !isPhoneNumber(phone)} loading={save.isPending}>Add trusted contact</Button>
        </form>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  )
}
