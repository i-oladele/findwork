import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { useCreateSupportRequest, useMySupportRequests } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import type { SupportTopic } from '../../lib/database.types'

const TOPICS: { id: SupportTopic; label: string }[] = [
  { id: 'payments', label: 'Payments' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'orders', label: 'Orders' },
  { id: 'account', label: 'Account' },
  { id: 'bug', label: 'Something is broken' },
  { id: 'other', label: 'Other' },
]

const FAQS = [
  {
    q: 'When does a provider get my money?',
    a: 'Only when you mark the job done. Until then it sits in escrow. If they decline, or either of you cancels before the start time, it goes back to your wallet automatically.',
  },
  {
    q: 'How do I get my money out?',
    a: 'Wallet → Withdraw. Add the bank account once, then request an amount. It leaves your balance straight away and our team sends it to your bank, usually the same working day.',
  },
  {
    q: 'A job went wrong. What now?',
    a: 'Open the booking and tap "Report a problem". The payment freezes immediately and a person on our team reads both sides before deciding.',
  },
  {
    q: 'Why can I not book a particular time?',
    a: 'Either the provider does not work that day, they are already booked then, or it is less than an hour away.',
  },
  {
    q: 'Are classifieds protected by escrow?',
    a: 'No. Classifieds are deals between two people. Meet in public, check the item, and pay only when you have it.',
  },
]

export function Help() {
  const requests = useMySupportRequests()
  const create = useCreateSupportRequest()
  const [topic, setTopic] = useState<SupportTopic>('payments')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await create.mutateAsync({ topic, message: message.trim() })
      setMessage('')
      setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Help and support" back="/settings" />
      <div className="px-[22px] pb-8">
        <SectionLabel className="mt-5 mb-2.5">Common questions</SectionLabel>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {FAQS.map((f, i) => (
            <div key={f.q} className={i < FAQS.length - 1 ? 'border-b border-line-soft' : ''}>
              <button
                onClick={() => setOpenFaq(openFaq === f.q ? null : f.q)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="flex-1 text-[15px] font-semibold text-ink">{f.q}</span>
                <i className={`ph-bold ph-caret-${openFaq === f.q ? 'up' : 'down'} text-sm text-muted-3`} />
              </button>
              {openFaq === f.q && <p className="px-4 pb-4 -mt-1 text-[14.5px] leading-[1.55] text-text-soft">{f.a}</p>}
            </div>
          ))}
        </div>

        <SectionLabel className="mt-6 mb-2.5">Ask us</SectionLabel>
        {sent ? (
          <Alert tone="success">
            Sent. We reply in the app — you will get a notification.{' '}
            <button className="font-semibold underline" onClick={() => setSent(false)}>
              Ask something else
            </button>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  className={`rounded-full px-3.5 py-2 text-[13.5px] ${
                    topic === t.id ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What has happened? Include a booking or order reference if there is one."
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 mt-3 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
            />
            {error && <Alert className="mt-3">{error}</Alert>}
            <Button onClick={submit} disabled={message.trim().length < 10} loading={create.isPending} className="mt-3 w-full">
              Send to support
            </Button>
          </>
        )}

        {requests.data && requests.data.length > 0 && (
          <>
            <SectionLabel className="mt-7 mb-2.5">Your requests</SectionLabel>
            <div className="space-y-2.5">
              {requests.data.map((r) => (
                <div key={r.id} className="bg-white border border-line rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">{r.topic}</span>
                    {r.status === 'open' ? (
                      <Badge tone="warning" icon="clock">Open</Badge>
                    ) : (
                      <Badge tone="success" icon="check-circle">Answered</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-[14.5px] leading-[1.5] text-ink">{r.message}</p>
                  {r.reply && (
                    <div className="mt-3 pt-3 border-t border-line-soft">
                      <div className="text-[12.5px] font-semibold text-muted-2">FindWork replied</div>
                      <p className="mt-1 text-[14.5px] leading-[1.5] text-text-soft">{r.reply}</p>
                    </div>
                  )}
                  <div className="text-[12px] text-muted-2 mt-2">{formatDateTime(r.created_at)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-start gap-2.5 mt-7">
          <i className="ph ph-shield-warning text-lg text-brand relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-muted">
            In an emergency, contact the police first. For safety concerns about someone on FindWork, report their
            profile and tell us here — see{' '}
            <Link to="/trust" className="font-semibold text-brand-hover">
              safety and trust
            </Link>
            .
          </p>
        </div>
      </div>
    </Screen>
  )
}
