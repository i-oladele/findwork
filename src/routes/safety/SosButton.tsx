import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { useProfile, useRaiseSos, useTrustedContacts } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { EMERGENCY_NUMBERS, safetyMessage, smsLink } from '../../lib/safety'

type Point = { lat: number; lng: number }

function currentPosition(): Promise<Point | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

/**
 * Tells the FindWork team you need help, with your position if the device
 * will give it. It does not call the police: the emergency numbers and your
 * trusted contacts are one tap away beside it.
 */
export function SosButton({ meetupId, place }: { meetupId: string | null; place: string | null }) {
  const { data: profile } = useProfile()
  const { data: contacts } = useTrustedContacts()
  const raise = useRaiseSos()
  const [sent, setSent] = useState<Point | 'no-location' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  async function send() {
    if (!window.confirm('Send an SOS to the FindWork team? Use this only if you feel unsafe.')) return
    setError(null)
    setLocating(true)
    const at = await currentPosition()
    setLocating(false)
    try {
      await raise.mutateAsync({ meetupId, lat: at?.lat ?? null, lng: at?.lng ?? null, note: '' })
      setSent(at ?? 'no-location')
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const at = sent && sent !== 'no-location' ? sent : null
  const name = profile?.full_name || 'me'

  return (
    <div className="mt-4 bg-white border-[1.5px] border-danger rounded-2xl p-4">
      <button onClick={send} disabled={raise.isPending || locating}
        className="w-full h-14 bg-danger text-white rounded-xl font-display font-bold text-[18px] tracking-[0.04em] disabled:opacity-60">
        {locating ? 'Finding you…' : raise.isPending ? 'Sending…' : 'SOS — I NEED HELP'}
      </button>
      <p className="mt-2 text-[13px] leading-[1.45] text-muted">
        Alerts the FindWork team with where you are. It does not call the police. In immediate danger, call an emergency number.
      </p>
      {sent && (
        <Alert tone="success" className="mt-3">
          The FindWork team has been alerted{sent === 'no-location' ? ', without your location (the device would not share it)' : ' with your location'}. Stay where other people are.
        </Alert>
      )}
      {error && <Alert className="mt-3">{error} Call an emergency number below.</Alert>}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[14px] font-semibold">
        {EMERGENCY_NUMBERS.map((n) => <a key={n.tel} href={`tel:${n.tel}`} className="min-h-11 inline-flex items-center text-danger"><i className="ph-fill ph-phone mr-1.5" />{n.label}</a>)}
      </div>
      {(contacts ?? []).map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 border-t border-line-soft pt-2 mt-2 text-[14px]">
          <span className="text-ink truncate">{c.name}</span>
          <span className="flex gap-4 font-semibold text-brand-hover">
            <a href={`tel:${c.phone}`} className="min-h-11 inline-flex items-center">Call</a>
            <a href={smsLink(c.phone, safetyMessage({ name, place, lat: at?.lat, lng: at?.lng, urgent: true }))} className="min-h-11 inline-flex items-center">Text for help</a>
          </span>
        </div>
      ))}
    </div>
  )
}
