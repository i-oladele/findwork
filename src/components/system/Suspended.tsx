import { useState } from 'react'
import { Screen } from '../chrome/Screen'
import { StatusBar } from '../chrome/StatusBar'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { useAuth } from '../../lib/authContext'
import { useCreateSupportRequest, useMySupportRequests } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'

/**
 * What a suspended account sees instead of the app. The server refuses its
 * writes regardless; this explains why, and keeps a line open to support.
 */
export function Suspended({ reason }: { reason: string | null }) {
  const { signOut } = useAuth()
  const requests = useMySupportRequests()
  const send = useCreateSupportRequest()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-10 pb-8">
        <i className="ph-fill ph-prohibit text-[34px] text-danger" />
        <h1 className="mt-4 font-display font-bold text-[26px] leading-tight text-ink">Your account is suspended</h1>
        <p className="mt-2 text-[15px] leading-[1.5] text-muted">
          You cannot book, sell, pay or message until this is resolved. Money in your wallet and in escrow stays where it is.
        </p>
        {reason && <Alert tone="info" className="mt-4">Reason given: {reason}</Alert>}

        <form className="mt-6" onSubmit={async (e) => {
          e.preventDefault()
          if (message.trim().length < 10 || send.isPending) return
          setError(null)
          try {
            await send.mutateAsync({ topic: 'account', message: message.trim() })
            setMessage('')
            setSent(true)
          } catch (err) { setError(friendlyError(err)) }
        }}>
          <label className="block text-[14px] text-ink font-semibold">Tell us your side
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000}
              placeholder="Explain what happened, or ask what you need to do to restore your account."
              className="block w-full mt-2 bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15px] font-normal leading-[1.5] text-ink outline-none" />
          </label>
          {error && <Alert className="mt-3">{error}</Alert>}
          {sent && <Alert tone="success" className="mt-3">Sent. The team will reply here.</Alert>}
          <Button type="submit" disabled={message.trim().length < 10} loading={send.isPending} className="mt-4">Send to support</Button>
        </form>

        {(requests.data ?? []).filter((r) => r.reply).map((r) => (
          <div key={r.id} className="mt-4 bg-white border border-line rounded-2xl p-4 text-[14px] leading-[1.5] text-text-soft">
            <div className="text-[12px] text-muted-2">FindWork support · {formatDateTime(r.closed_at ?? r.created_at)}</div>
            <p className="mt-1.5 whitespace-pre-wrap">{r.reply}</p>
          </div>
        ))}

        <button type="button" className="mt-6 min-h-11 text-[14.5px] text-muted" onClick={() => void signOut()}>Sign out</button>
      </div>
    </Screen>
  )
}
