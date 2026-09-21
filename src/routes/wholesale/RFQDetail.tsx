import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { ReportButton } from '../../components/ui/ReportButton'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useAcceptRfqQuote, useCloseRfq, useRfq, useRfqQuotes, useSubmitRfqQuote } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'

export function RFQDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: rfq, isLoading } = useRfq(id)
  const quotes = useRfqQuotes(id)
  const accept = useAcceptRfqQuote()
  const close = useCloseRfq()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />
  if (!rfq) {
    return (
      <Screen>
        <PageHeader title="Request" back="/rfqs" />
        <EmptyState icon="ph-package" title="Request not found" />
      </Screen>
    )
  }

  const isBuyer = rfq.buyer_id === user?.id
  const myQuote = quotes.data?.find((q) => q.supplier_id === user?.id)

  return (
    <Screen>
      <PageHeader title={rfq.title} back="/rfqs" />
      <div className="px-[22px] pb-8">
        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            {rfq.quantity && <span className="text-[13.5px] text-muted-3">Qty {rfq.quantity}</span>}
            {rfq.deadline && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-line" />
                <span className="text-[13.5px] text-muted-3">by {rfq.deadline}</span>
              </>
            )}
          </div>
          {rfq.budget_max ? (
            <div className="font-display font-bold text-2xl text-cream mt-2">Up to {formatNaira(rfq.budget_max)}</div>
          ) : (
            <div className="font-display font-bold text-xl text-cream mt-2">Open budget</div>
          )}
          <p className="mt-2 text-[13.5px] leading-[1.5] text-muted-3">{rfq.description}</p>
        </div>

        {error && <Alert className="mt-4">{error}</Alert>}

        {isBuyer ? (
          <>
            <SectionLabel className="mt-5 mb-2.5">Supplier quotes</SectionLabel>
            <QueryState
              query={quotes}
              errorMessage="We could not load quotes."
              empty={{ icon: 'ph-hourglass', title: 'No quotes yet', body: 'Suppliers can see your request now.' }}
            >
              {(list) =>
                list.map((q, i) => (
                  <div key={q.id} className={`bg-white rounded-2xl p-4 mb-3 ${i === 0 && rfq.status !== 'closed' ? 'border-[1.5px] border-brand' : 'border border-line'}`}>
                    <div className="flex gap-3.5">
                      <PlaceholderImage shape="circle" src={q.supplier?.avatar_url ?? undefined} className="w-[52px] h-[52px] flex-none" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-display font-semibold text-[16px] text-ink truncate">{q.supplier?.full_name ?? 'Supplier'}</span>
                          <span className="font-display font-bold text-[17px] text-ink">{formatNaira(q.price)}</span>
                        </div>
                        {q.lead_time && <div className="text-[12.5px] text-muted-2 mt-1">Lead time {q.lead_time}</div>}
                        {q.message && <p className="mt-2 text-[14px] leading-[1.5] text-text-soft">“{q.message}”</p>}
                      </div>
                    </div>
                    <div className="flex gap-2.5 mt-3.5">
                      {q.accepted ? (
                        <span className="flex-1 flex items-center">
                          <Badge tone="success" icon="check-circle">Accepted</Badge>
                        </span>
                      ) : rfq.status !== 'closed' ? (
                        <button
                          onClick={() => {
                            setError(null)
                            if (!window.confirm(`Accept ${q.supplier?.full_name ?? 'this supplier'} at ${formatNaira(q.price)}?`)) return
                            accept.mutate(q.id, { onError: (e) => setError(friendlyError(e)) })
                          }}
                          className="flex-1 flex items-center justify-center h-11 bg-brand text-white rounded-lg text-[14.5px] font-semibold"
                        >
                          Accept quote
                        </button>
                      ) : (
                        <span className="flex-1" />
                      )}
                      <Link
                        to={`/chat/with/${q.supplier_id}`}
                        aria-label="Message supplier"
                        className="flex-none flex items-center justify-center w-11 h-11 border border-line rounded-lg text-ink"
                      >
                        <i className="ph ph-chat-circle-dots text-lg" />
                      </Link>
                    </div>
                  </div>
                ))
              }
            </QueryState>

            {rfq.status !== 'closed' && (
              <button
                onClick={() => {
                  if (!window.confirm('Close this request? Suppliers will no longer be able to quote.')) return
                  close.mutate(rfq.id, { onError: (e) => setError(friendlyError(e)) })
                }}
                className="w-full mt-4 text-[15px] font-semibold text-muted"
              >
                Close this request
              </button>
            )}
          </>
        ) : (
          <SupplierView rfqId={rfq.id} closed={rfq.status === 'closed'} quoted={myQuote?.price} accepted={myQuote?.accepted} />
        )}

        {!isBuyer && <ReportButton targetType="rfq" targetId={rfq.id} label="Report this request" className="mt-6" />}
      </div>
    </Screen>
  )
}

function SupplierView({
  rfqId,
  closed,
  quoted,
  accepted,
}: {
  rfqId: string
  closed: boolean
  quoted?: number
  accepted?: boolean
}) {
  const submit = useSubmitRfqQuote()
  const [price, setPrice] = useState('')
  const [leadTime, setLeadTime] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (quoted !== undefined) {
    return (
      <Alert tone={accepted ? 'success' : 'info'} className="mt-5">
        {accepted
          ? `Your quote of ${formatNaira(quoted)} was accepted. The buyer will be in touch.`
          : `You quoted ${formatNaira(quoted)}. You will be notified if the buyer accepts.`}
      </Alert>
    )
  }
  if (closed) {
    return (
      <Alert tone="info" className="mt-5">
        This request is closed.
      </Alert>
    )
  }

  async function send() {
    setError(null)
    try {
      await submit.mutateAsync({
        rfq_id: rfqId,
        price: parseNaira(price),
        lead_time: leadTime.trim() || undefined,
        message: message.trim() || undefined,
      })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <>
      <SectionLabel className="mt-5 mb-2.5">Your quote</SectionLabel>
      <div className="space-y-4">
        <Input label="Price (₦)" value={price} onChange={setPrice} placeholder="240000" />
        <Input label="Lead time" value={leadTime} onChange={setLeadTime} placeholder="7 days" />
        <div>
          <SectionLabel className="mb-2">Message</SectionLabel>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What is included, minimum order, samples"
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
          />
        </div>
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button onClick={send} disabled={parseNaira(price) <= 0} loading={submit.isPending} className="mt-4 w-full">
        Send quote
      </Button>
    </>
  )
}
