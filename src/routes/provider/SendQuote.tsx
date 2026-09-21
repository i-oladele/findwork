import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ReportButton } from '../../components/ui/ReportButton'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useJob, useMySentQuotes, usePlans, useSendQuote } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import type { ProviderProfile } from '../../lib/database.types'

export function SendQuote() {
  return <RequireProvider>{(p) => <QuoteForm provider={p} />}</RequireProvider>
}

function QuoteForm({ provider }: { provider: ProviderProfile }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: job, isLoading } = useJob(id)
  const { data: sent } = useMySentQuotes()
  const { data: plans } = usePlans()
  const sendQuote = useSendQuote()

  const [price, setPrice] = useState('')
  const [days, setDays] = useState('')
  const [startDay, setStartDay] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />
  if (!job) {
    return (
      <Screen>
        <PageHeader title="Your quote" back="/provider/jobs" />
        <EmptyState icon="ph-briefcase" title="Job not found" body="It may have been removed." />
      </Screen>
    )
  }

  const existing = sent?.find((q) => q.job_id === job.id)
  const rate = Number(plans?.find((p) => p.id === provider.plan)?.commission_rate ?? 0.06)
  const amount = parseNaira(price)
  const dayCount = Number(days.replace(/\D/g, '')) || 0
  const canSubmit = amount > 0 && dayCount > 0 && job.status === 'open'

  async function submit() {
    setError(null)
    try {
      await sendQuote.mutateAsync({
        job_id: job!.id,
        price: amount,
        days: dayCount,
        start_day: startDay.trim() || undefined,
        message: message.trim() || undefined,
      })
      navigate('/provider/jobs', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Your quote" back="/provider/jobs" />
      <div className="px-[22px] pb-6">
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-display font-semibold text-[16.5px] text-cream">{job.title}</div>
          <p className="mt-2 text-[14px] leading-[1.5] text-muted-3">{job.description}</p>
          <div className="flex items-center gap-3 mt-3 text-[13.5px] text-muted-3">
            <span>Budget {formatNaira(job.budget)}</span>
            <span className="w-1 h-1 rounded-full bg-ink-line" />
            <span>
              {job.quote_count} quote{job.quote_count === 1 ? '' : 's'} in
            </span>
            {job.needed_by && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-line" />
                <span>By {job.needed_by}</span>
              </>
            )}
          </div>
        </div>

        {existing ? (
          <Alert tone="success" className="mt-5">
            You quoted {formatNaira(existing.price)} for {existing.days} day{existing.days === 1 ? '' : 's'}.
            {existing.status === 'accepted'
              ? ' The customer accepted — see Bookings.'
              : existing.status === 'declined'
                ? ' The customer chose another quote.'
                : ' You will be notified if the customer accepts.'}
          </Alert>
        ) : job.status !== 'open' ? (
          <Alert tone="info" className="mt-5">
            This job is closed.
          </Alert>
        ) : (
          <>
            <SectionLabel className="mt-5 mb-2">Your price</SectionLabel>
            <div className="flex items-center bg-white border-[1.5px] border-ink rounded-lg h-[58px] px-4">
              <span className="font-display font-bold text-2xl text-ink">₦</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                placeholder={String(job.budget)}
                aria-label="Your price"
                className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-2xl text-ink placeholder:text-muted-4"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <div className="flex-1">
                <SectionLabel className="mb-2">Days needed</SectionLabel>
                <input
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  inputMode="numeric"
                  placeholder="3"
                  className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-4"
                />
              </div>
              <div className="flex-1">
                <SectionLabel className="mb-2">Can start</SectionLabel>
                <input
                  value={startDay}
                  onChange={(e) => setStartDay(e.target.value)}
                  placeholder="Friday"
                  className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-4"
                />
              </div>
            </div>

            <SectionLabel className="mt-4 mb-2">Your message</SectionLabel>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Why you are right for this job, and anything you need to know"
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
            />
            {error && <Alert className="mt-4">{error}</Alert>}
          </>
        )}

        <ReportButton targetType="job" targetId={job.id} label="Report this job" className="mt-6" />
      </div>

      {!existing && job.status === 'open' && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
          <div className="flex justify-between text-[13.5px] text-muted mb-2.5">
            <span>You receive after {Math.round(rate * 100)}% FindWork fee</span>
            <span className="font-display font-bold text-ink">{formatNaira(amount - Math.round(amount * rate))}</span>
          </div>
          <Button onClick={submit} disabled={!canSubmit} loading={sendQuote.isPending} className="w-full">
            Send quote
          </Button>
        </div>
      )}
    </Screen>
  )
}
