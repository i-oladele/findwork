import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Toggle } from '../../components/ui/Toggle'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ReportButton } from '../../components/ui/ReportButton'
import { QuoteHistory } from '../../components/ui/QuoteHistory'
import { EmptyState, ErrorState, FullScreenLoader } from '../../components/system/States'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useJob, useMySentQuotes, usePlans, useSendQuote, useReviseQuote, useWithdrawQuote } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import type { ProviderProfile, QuoteMilestone } from '../../lib/database.types'
import { useT } from '../../lib/i18n'

export function SendQuote() {
  return <RequireProvider>{(p) => <QuoteForm provider={p} />}</RequireProvider>
}

function QuoteForm({ provider }: { provider: ProviderProfile }) {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const jobQuery = useJob(id)
  const { data: job } = jobQuery
  const sentQuery = useMySentQuotes()
  const { data: sent } = sentQuery
  const { data: plans } = usePlans()
  const sendQuote = useSendQuote()
  const reviseQuote = useReviseQuote()
  const withdrawQuote = useWithdrawQuote()
  const [editing, setEditing] = useState(false)
  const [editRevision, setEditRevision] = useState<number | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  const [price, setPrice] = useState('')
  const [days, setDays] = useState('')
  const [startDay, setStartDay] = useState('')
  const [message, setMessage] = useState('')
  // Empty means one payment; otherwise the stages the price is split into.
  const [stages, setStages] = useState<{ title: string; amount: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  if (jobQuery.isLoading || sentQuery.isLoading) return <FullScreenLoader />
  if (jobQuery.isError || sentQuery.isError) return <Screen><PageHeader title={t('Your quote')} back="/provider/jobs" /><ErrorState message="We could not load this job and your quote." onRetry={() => { void jobQuery.refetch(); void sentQuery.refetch() }} /></Screen>
  if (!job) {
    return (
      <Screen>
        <PageHeader title={t('Your quote')} back="/provider/jobs" />
        <EmptyState icon="ph-briefcase" title={t('Job not found')} body={t('It may have been removed.')} />
      </Screen>
    )
  }

  const existing = sent?.find((q) => q.job_id === job.id)
  const rate = Number(plans?.find((p) => p.id === provider.plan)?.commission_rate ?? 0.06)
  const amount = parseNaira(price)
  const dayCount = Number(days.replace(/\D/g, '')) || 0
  const stageTotal = stages.reduce((sum, s) => sum + parseNaira(s.amount), 0)
  const stagesValid = stages.length === 0 || (stages.every((s) => s.title.trim() && parseNaira(s.amount) > 0) && stageTotal === amount)
  const canSubmit = amount > 0 && dayCount > 0 && job.status === 'open' && stagesValid
  const pending = sendQuote.isPending || reviseQuote.isPending || withdrawQuote.isPending

  function startEditing() {
    if (!existing) return
    setPrice(String(existing.price)); setDays(String(existing.days)); setStartDay(existing.start_day ?? ''); setMessage(existing.message ?? '')
    setStages((existing.milestones ?? []).map((m: QuoteMilestone) => ({ title: m.title, amount: String(m.amount) })))
    setEditRevision(existing.revision); setEditing(true); setConfirmWithdraw(false); setError(null)
  }

  async function submit() {
    if (!canSubmit || pending) return
    setError(null)
    try {
      const fields = {
        price: amount,
        days: dayCount,
        start_day: startDay.trim() || undefined,
        message: message.trim() || undefined,
        milestones: stages.length ? stages.map((s) => ({ title: s.title.trim(), amount: parseNaira(s.amount) })) : null,
      }
      if (existing && editRevision !== null) await reviseQuote.mutateAsync({ ...fields, id: existing.id, revision: editRevision })
      else await sendQuote.mutateAsync({ ...fields, job_id: job!.id })
      navigate('/provider/jobs', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title={t('Your quote')} back="/provider/jobs" />
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

        {existing && !editing ? (
          <>
          <Alert tone={existing.status === 'withdrawn' ? 'info' : 'success'} className="mt-5">
            You quoted {formatNaira(existing.price)} for {existing.days} day{existing.days === 1 ? '' : 's'}.
            {existing.status === 'accepted'
              ? ' The customer accepted — see Bookings.'
              : existing.status === 'declined'
                ? ' The customer chose another quote.'
                : existing.status === 'withdrawn' ? ' This quote is withdrawn and cannot be accepted.'
                  : ' You will be notified if the customer accepts.'}
          </Alert>
          {job.status === 'open' && (existing.status === 'sent' || existing.status === 'withdrawn') && <div className="flex gap-4 mt-4 text-sm font-semibold">
            <button disabled={pending} className="min-h-11" onClick={startEditing}>{existing.status === 'withdrawn' ? 'Revise and resend' : 'Edit quote'}</button>
            {existing.status === 'sent' && <button disabled={pending} className="min-h-11 text-brand" onClick={() => setConfirmWithdraw(true)}>{t('Withdraw quote')}</button>}
          </div>}
          {confirmWithdraw && <div className="mt-3 border border-line rounded-xl p-4 text-sm">
            <p>{t('Withdraw this quote? The customer will be notified and will no longer be able to accept it.')}</p>
            <div className="flex gap-4 mt-2">
              <button disabled={pending} className="min-h-11 text-brand font-semibold" onClick={async () => {
                setError(null)
                try { await withdrawQuote.mutateAsync({ id: existing.id, revision: existing.revision }); setConfirmWithdraw(false) }
                catch (err) { setError(friendlyError(err)) }
              }}>{t('Confirm withdrawal')}</button>
              <button disabled={pending} onClick={() => setConfirmWithdraw(false)}>{t('Keep quote')}</button>
            </div>
          </div>}
          <QuoteHistory quoteId={existing.id} />
          </>
        ) : job.status !== 'open' ? (
          <Alert tone="info" className="mt-5">
            {t('This job is closed.')}
          </Alert>
        ) : (
          <>
            <SectionLabel className="mt-5 mb-2">{t('Your price')}</SectionLabel>
            <div className="flex items-center bg-white border-[1.5px] border-ink rounded-lg h-[58px] px-4">
              <span className="font-display font-bold text-2xl text-ink">₦</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                placeholder={String(job.budget)}
                aria-label={t('Your price')}
                className="flex-1 min-w-0 bg-transparent outline-none font-display font-bold text-2xl text-ink placeholder:text-muted-4"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <div className="flex-1">
                <SectionLabel className="mb-2">{t('Days needed')}</SectionLabel>
                <input
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  inputMode="numeric"
                  aria-label={t('Days needed')}
                  placeholder="3"
                  className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-4"
                />
              </div>
              <div className="flex-1">
                <SectionLabel className="mb-2">{t('Can start')}</SectionLabel>
                <input
                  value={startDay}
                  onChange={(e) => setStartDay(e.target.value)}
                  placeholder={t('Friday')}
                  aria-label={t('Can start')}
                  maxLength={100}
                  className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-4"
                />
              </div>
            </div>

            <SectionLabel className="mt-4 mb-2">{t('Your message')}</SectionLabel>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              aria-label={t('Your message')}
              maxLength={2000}
              placeholder={t('Why you are right for this job, and anything you need to know')}
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
            />
            <div className="mt-4 bg-white border border-line rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-ink">{t('Get paid in stages')}</div>
                  <p className="text-[13px] leading-[1.45] text-muted-2 mt-0.5">{t('The customer still pays the full price into escrow, then releases each stage as you finish it.')}</p>
                </div>
                <Toggle label={t('Get paid in stages')} on={stages.length > 0} onChange={(on) => setStages(on ? [{ title: '', amount: '' }, { title: '', amount: '' }] : [])} />
              </div>
              {stages.map((stage, i) => (
                <div key={i} className="flex gap-2 mt-3">
                  <input value={stage.title} maxLength={80} placeholder={`Stage ${i + 1}`} aria-label={`Stage ${i + 1} name`}
                    onChange={(e) => setStages((all) => all.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))}
                    className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 text-[14.5px] text-ink outline-none" />
                  <input value={stage.amount} inputMode="numeric" placeholder="₦" aria-label={`Stage ${i + 1} amount`}
                    onChange={(e) => setStages((all) => all.map((s, j) => (j === i ? { ...s, amount: e.target.value } : s)))}
                    className="w-28 bg-cream rounded-lg h-11 px-3 text-[14.5px] text-ink outline-none" />
                  {stages.length > 2 && (
                    <button type="button" aria-label={`Remove stage ${i + 1}`} className="w-11 h-11 text-muted" onClick={() => setStages((all) => all.filter((_, j) => j !== i))}>
                      <i className="ph ph-x" />
                    </button>
                  )}
                </div>
              ))}
              {stages.length > 0 && (
                <div className="flex items-center justify-between mt-3 text-[13.5px]">
                  <span className={stageTotal === amount ? 'text-success-text' : 'text-danger'}>Stages total {formatNaira(stageTotal)} of {formatNaira(amount)}</span>
                  {stages.length < 6 && <button type="button" className="min-h-11 font-semibold text-brand" onClick={() => setStages((all) => [...all, { title: '', amount: '' }])}>{t('Add a stage')}</button>}
                </div>
              )}
            </div>
            {editing && <button disabled={pending} className="min-h-11 mt-3 text-sm underline" onClick={() => setEditing(false)}>{t('Cancel changes')}</button>}
          </>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}

        <ReportButton targetType="job" targetId={job.id} label={t('Report this job')} className="mt-6" />
      </div>

      {(!existing || editing) && job.status === 'open' && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
          <div className="flex justify-between text-[13.5px] text-muted mb-2.5">
            <span>You receive after {Math.round(rate * 100)}% FindWork fee</span>
            <span className="font-display font-bold text-ink">{formatNaira(amount - Math.round(amount * rate))}</span>
          </div>
          <Button onClick={submit} disabled={!canSubmit} loading={pending} className="w-full">
            {editing ? existing?.status === 'withdrawn' ? 'Resend quote' : 'Save revised quote' : 'Send quote'}
          </Button>
        </div>
      )}
    </Screen>
  )
}
