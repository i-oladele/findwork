import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { StarRating } from '../../components/ui/StarRating'
import { SlotPicker } from '../../components/ui/SlotPicker'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  platformFee,
  useAcceptJobQuote,
  useCloseJob,
  useJob,
  useQuotesForJob,
  useWalletSummary,
  type QuoteWithProvider,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'

/** One posted job and the quotes on it. Accepting books the provider at the quoted price. */
export function JobQuotes() {
  const { jobId } = useParams<{ jobId: string }>()
  const { user } = useAuth()
  const job = useJob(jobId)
  const quotes = useQuotesForJob(jobId)
  const close = useCloseJob()
  const [accepting, setAccepting] = useState<QuoteWithProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (job.isLoading) return <FullScreenLoader />
  if (!job.data || job.data.customer_id !== user?.id) {
    return (
      <Screen>
        <PageHeader title="Job" back="/quotes" />
        <EmptyState icon="ph-note-blank" title="Job not found" />
      </Screen>
    )
  }

  const j = job.data

  if (accepting) {
    return <AcceptQuote quote={accepting} jobTitle={j.title} onBack={() => setAccepting(null)} />
  }

  return (
    <Screen>
      <PageHeader title={j.title} back="/quotes" />
      <div className="px-[22px] pb-8">
        <div className="flex items-center gap-2.5 mt-3">
          <span className="font-display font-bold text-[26px] text-ink">
            {j.quote_count} quote{j.quote_count === 1 ? '' : 's'}
          </span>
          <span className="text-sm text-muted">Budget {formatNaira(j.budget)}</span>
        </div>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-text-soft">{j.description}</p>

        {j.status === 'closed' && (
          <Alert tone="info" className="mt-4">
            This job is closed. {quotes.data?.some((q) => q.status === 'accepted') ? 'You accepted a quote — see Bookings.' : ''}
          </Alert>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}

        <QueryState
          query={quotes}
          errorMessage="We could not load quotes."
          empty={{
            icon: 'ph-hourglass',
            title: 'No quotes yet',
            body: 'Providers see your job now. You will get a notification when the first quote arrives.',
          }}
        >
          {(list) =>
            list.map((q, i) => (
              <Card key={q.id} active={i === 0 && j.status === 'open'} className="p-4 mt-4">
                <div className="flex gap-3.5">
                  <PlaceholderImage src={q.provider?.photo_urls?.[0]} className="w-[52px] h-[52px] flex-none" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link to={`/provider/${q.provider_id}`} className="font-display font-semibold text-[16px] text-ink truncate">
                        {q.provider?.business_name ?? 'Provider'}
                      </Link>
                      <span className="font-display font-bold text-[17px] text-ink">{formatNaira(q.price)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[12.5px] text-muted-2">
                      {q.provider && q.provider.reviews > 0 && <StarRating rating={Number(q.provider.rating)} />}
                      {q.provider?.verified && <i className="ph-fill ph-shield-check text-success" />}
                      <span>
                        {q.days} day{q.days === 1 ? '' : 's'}
                        {q.start_day ? ` · can start ${q.start_day}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
                {q.message && <p className="mt-3 text-[14.5px] leading-[1.5] text-text-soft">“{q.message}”</p>}
                <div className="flex gap-2.5 mt-3.5">
                  {j.status === 'open' ? (
                    <button
                      onClick={() => setAccepting(q)}
                      className="flex-1 flex items-center justify-center h-[46px] bg-brand text-white rounded-lg text-[15px] font-semibold"
                    >
                      Accept quote
                    </button>
                  ) : q.status === 'accepted' ? (
                    <span className="flex-1 flex items-center justify-center">
                      <Badge tone="success" icon="check-circle">Accepted</Badge>
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Link
                    to={`/chat/with/${q.provider_id}`}
                    aria-label="Message provider"
                    className="flex-none flex items-center justify-center w-[46px] h-[46px] border border-line rounded-lg text-ink"
                  >
                    <i className="ph ph-chat-circle-dots text-[19px]" />
                  </Link>
                </div>
              </Card>
            ))
          }
        </QueryState>

        {j.status === 'open' && (
          <button
            onClick={() => {
              if (!window.confirm('Close this job? Providers will no longer be able to quote.')) return
              close.mutate(j.id, { onError: (e) => setError(friendlyError(e)) })
            }}
            className="w-full mt-6 text-[15px] font-semibold text-muted"
          >
            Close this job
          </button>
        )}
      </div>
    </Screen>
  )
}

function AcceptQuote({ quote, jobTitle, onBack }: { quote: QuoteWithProvider; jobTitle: string; onBack: () => void }) {
  const navigate = useNavigate()
  const accept = useAcceptJobQuote()
  const { data: wallet } = useWalletSummary()
  const [at, setAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fee = platformFee(quote.price)
  const total = quote.price + fee
  const short = Math.max(0, total - (wallet?.balance ?? 0))

  async function submit() {
    if (!at) return
    setError(null)
    try {
      const bookingId = await accept.mutateAsync({ quoteId: quote.id, startAt: at })
      navigate(`/bookings/${bookingId}/confirmed`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <div className="px-[22px]">
        <div className="h-[max(12px,env(safe-area-inset-top))]" />
        <button onClick={onBack} className="inline-flex items-center gap-1.5 h-11 -ml-1 text-ink font-semibold">
          <i className="ph-bold ph-arrow-left text-[20px]" /> Back to quotes
        </button>
        <h2 className="mt-2 font-display font-bold text-[24px] leading-[1.15] text-ink">When should they start?</h2>
        <p className="mt-2 text-[14.5px] text-muted">
          {quote.provider?.business_name ?? 'The provider'} · {jobTitle}
        </p>
        <div className="mt-5">
          <SlotPicker providerId={quote.provider_id} value={at} onChange={setAt} />
        </div>
        <div className="bg-white border border-line rounded-2xl p-4 mt-5 text-[15px] text-text-soft">
          <div className="flex justify-between">
            <span>Quoted price</span>
            <span className="text-ink">{formatNaira(quote.price)}</span>
          </div>
          <div className="flex justify-between mt-2">
            <span>Service fee (5%)</span>
            <span className="text-ink">{formatNaira(fee)}</span>
          </div>
          <div className="flex justify-between mt-3 pt-3 border-t border-line-soft font-display font-bold text-ink">
            <span>Held in escrow</span>
            <span>{formatNaira(total)}</span>
          </div>
        </div>
        {error && <Alert className="mt-4">{error}</Alert>}
      </div>
      <div className="sticky bottom-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-6">
        {short > 0 ? (
          <Button to={`/wallet/add?amount=${short}&return=${encodeURIComponent(window.location.pathname)}`} className="w-full">
            Add {formatNaira(short)} to your wallet
          </Button>
        ) : (
          <Button onClick={submit} disabled={!at} loading={accept.isPending} className="w-full">
            Accept and pay {formatNaira(total)} into escrow
          </Button>
        )}
      </div>
    </Screen>
  )
}
