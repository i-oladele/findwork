import { AskAssistant } from '../../components/ui/AskAssistant'
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
import { msg, useT } from '../../lib/i18n'

const TOPICS: { id: SupportTopic; label: string }[] = [
  { id: 'payments', label: msg('Payments') },
  { id: 'bookings', label: msg('Bookings') },
  { id: 'orders', label: msg('Orders') },
  { id: 'account', label: msg('Account') },
  { id: 'bug', label: msg('Something is broken') },
  { id: 'other', label: msg('Other') },
]

const FAQS = [
  {
    q: msg('When does a provider get my money?'),
    a: msg('Only when you mark the job done. Until then it sits in escrow. If they decline, or either of you cancels before the start time, it goes back to your wallet automatically.'),
  },
  {
    q: msg('How do I get my money out?'),
    a: msg('Wallet → Withdraw. Add your bank account once, then request an amount. It leaves your balance straight away. To an account your bank has confirmed it is usually paid within minutes; otherwise our team sends it, usually the same working day.'),
  },
  {
    q: msg('A job went wrong. What now?'),
    a: msg('Open the booking and tap "Report a problem". The payment freezes immediately and a person on our team reads both sides before deciding.'),
  },
  {
    q: msg('Why can I not book a particular time?'),
    a: msg('Either the provider does not work that day, they are already booked then, or it is less than an hour away.'),
  },
  {
    q: msg('Are classifieds protected by escrow?'),
    a: msg('No. Classifieds are deals between two people. Meet in public, check the item, and pay only when you have it.'),
  },
]

export function Help() {
  const t = useT()
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
      <PageHeader title={t('Help and support')} back="/settings" />
      <div className="px-[22px] pb-8">
        <div className="mt-4">
          <AskAssistant task="support" title={t('Ask how something works')} placeholder={t('How do I get a refund?')}
            note="Answered by an AI assistant from FindWork's own rules. It cannot see your account or change anything: for a specific payment or order, write to the team below." />
        </div>
        <SectionLabel className="mt-5 mb-2.5">{t('Common questions')}</SectionLabel>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {FAQS.map((f, i) => (
            <div key={t(f.q)} className={i < FAQS.length - 1 ? 'border-b border-line-soft' : ''}>
              <button
                onClick={() => setOpenFaq(openFaq === f.q ? null : f.q)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="flex-1 text-[15px] font-semibold text-ink">{t(f.q)}</span>
                <i className={`ph-bold ph-caret-${openFaq === f.q ? 'up' : 'down'} text-sm text-muted-3`} />
              </button>
              {openFaq === f.q && <p className="px-4 pb-4 -mt-1 text-[14.5px] leading-[1.55] text-text-soft">{t(f.a)}</p>}
            </div>
          ))}
        </div>

        <SectionLabel className="mt-6 mb-2.5">{t('Ask us')}</SectionLabel>
        {sent ? (
          <Alert tone="success">
            Sent. We reply in the app — you will get a notification.{' '}
            <button className="font-semibold underline" onClick={() => setSent(false)}>
              {t('Ask something else')}
            </button>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTopic(option.id)}
                  className={`rounded-full px-3.5 py-2 text-[13.5px] ${
                    topic === option.id ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
                  }`}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t('What has happened? Include a booking or order reference if there is one.')}
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 mt-3 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
            />
            {error && <Alert className="mt-3">{error}</Alert>}
            <Button onClick={submit} disabled={message.trim().length < 10} loading={create.isPending} className="mt-3 w-full">
              {t('Send to support')}
            </Button>
          </>
        )}

        {requests.data && requests.data.length > 0 && (
          <>
            <SectionLabel className="mt-7 mb-2.5">{t('Your requests')}</SectionLabel>
            <div className="space-y-2.5">
              {requests.data.map((r) => (
                <div key={r.id} className="bg-white border border-line rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-2">{r.topic}</span>
                    {r.status === 'open' ? (
                      <Badge tone="warning" icon="clock">{t('Open')}</Badge>
                    ) : (
                      <Badge tone="success" icon="check-circle">{t('Answered')}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-[14.5px] leading-[1.5] text-ink">{r.message}</p>
                  {r.reply && (
                    <div className="mt-3 pt-3 border-t border-line-soft">
                      <div className="text-[12.5px] font-semibold text-muted-2">{t('FindWork replied')}</div>
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
              {t('safety and trust')}
            </Link>
            .
          </p>
        </div>
      </div>
    </Screen>
  )
}
