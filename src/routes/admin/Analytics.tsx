import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { QueryState } from '../../components/system/QueryState'
import { ErrorState, FullScreenLoader } from '../../components/system/States'
import { useProfile } from '../../lib/api/profile'
import { useAnalytics, useEngagement, type EngagementReport } from '../../lib/api/analytics'
import { anomalies, forecast } from '../../lib/forecast'
import { askAssistant, AssistantUnavailable } from '../../lib/api/assistant'
import { analyticsCsv, reportDate, reportRange, type AnalyticsReport } from '../../lib/analytics'
import { formatDateTime, formatNaira } from '../../lib/format'
import { staffCan } from '../../lib/staff'

export function Analytics() {
  const profile = useProfile()
  if (profile.isLoading) return <FullScreenLoader />
  if (profile.isError) return <Screen><ErrorState message="We could not check your access." onRetry={() => void profile.refetch()} /></Screen>
  if (!staffCan(profile.data?.staff_role, 'analytics')) return <Navigate to="/home" replace />
  return <AnalyticsDashboard />
}

function AnalyticsDashboard() {
  const [from, setFrom] = useState(() => reportDate(new Date(Date.now() - 29 * 86_400_000)))
  const [through, setThrough] = useState(() => reportDate())
  const report = useAnalytics(from, through)
  const valid = reportRange(from, through)
  function download(data: AnalyticsReport) {
    const url = URL.createObjectURL(new Blob([analyticsCsv(data)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `findwork-activity-${from}-${through}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Screen>
    <PageHeader title="Platform reports" back="/admin" />
    <div className="px-[22px] pb-8 space-y-5">
      <p className="text-sm text-muted">Dates use Lagos time. Reports refresh every 30 seconds while this page is open.</p>
      <div className="flex gap-3">
        <label className="min-w-0 flex-1 text-sm">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full mt-1 bg-white rounded-lg border border-line p-2" /></label>
        <label className="min-w-0 flex-1 text-sm">Through<input type="date" value={through} onChange={(e) => setThrough(e.target.value)} className="w-full mt-1 bg-white rounded-lg border border-line p-2" /></label>
      </div>
      {!valid ? <p role="alert" className="text-brand">Choose an ordered date range of up to 366 days.</p> : <QueryState query={report} errorMessage="We could not load platform reports.">
        {(data) => <>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted">Updated {formatDateTime(data.as_of)}</span>
            <button className="text-brand underline" onClick={() => download(data)}>Export daily CSV</button>
          </div>
          <h3 className="font-semibold text-lg">Activity in this period</h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="New accounts" value={data.period.signups} />
            <Metric label="Active users" value={data.period.active_users} />
            <Metric label="Bookings created" value={data.period.bookings} />
            <Metric label="Orders placed" value={data.period.orders} />
            <Metric label="Messages sent" value={data.period.messages} />
            <Metric label="Ledger entries" value={data.period.ledger_entries} />
          </div>
          <h3 className="font-semibold text-lg">Income and collections in this period</h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Marketplace fees" value={formatNaira(data.period.marketplace_fees)} />
            <Metric label="Subscription charges" value={formatNaira(data.period.subscriptions)} />
            <Metric label="Course charges" value={formatNaira(data.period.courses)} />
            <Metric label="Own-catalog net collections" value={formatNaira(data.period.catalog_collections)} />
            <Metric label="Wallet top-ups" value={formatNaira(data.period.topups)} />
            <Metric label="Customer wallet refunds" value={formatNaira(data.period.customer_refunds)} />
            <Metric label="Sent wallet to wallet" value={formatNaira(data.period.transfers ?? 0)} />
          </div>
          <h3 className="font-semibold text-lg">Current obligations</h3>
          <p className="text-sm text-muted">Current totals, independent of the selected date range.</p>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Open accounts" value={data.current.users} />
            <Metric label="Wallet balances" value={formatNaira(data.current.wallet_balances)} />
            <Metric label="Escrow held" value={formatNaira(data.current.escrow_held)} />
            <Metric label="Withdrawals to send" value={formatNaira(data.current.pending_withdrawals)} />
            <Metric label="Gateway refunds due" value={formatNaira(data.current.gateway_refunds_due)} />
            <Metric label="Open disputes" value={data.current.open_disputes} />
          </div>
          <details className="text-sm text-muted space-y-2">
            <summary className="cursor-pointer font-semibold text-ink py-2">How these figures are calculated</summary>
            <p>Marketplace fees include provider commissions and customer service fees on released bookings. Seller-order commissions are reversed in the period an order is refunded.</p>
            <p>Subscription and course charges use their ledger entries. Own-catalog collections are goods charged at checkout less goods refunded; they exclude delivery and do not measure profit or completed fulfilment.</p>
            <p>Wallet top-ups, transfers between customers and escrow are customer funds, not revenue. Delivery charges, gateway costs, taxes and operating costs are excluded from income figures.</p>
            <p>Active users have a booking, order, message, quote or wallet entry in the selected period. This measures recorded activity, not page views or logins.</p>
          </details>
          <ForecastSection daily={data.daily} />
          <Analyst from={from} through={through} />
          <Engagement from={from} through={through} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="text-left font-semibold mb-2">Daily activity (Lagos)</caption>
              <thead><tr>{['Date','Signups','Bookings','Orders'].map((label) => <th key={label} scope="col" className="p-2 border-b border-line">{label}</th>)}</tr></thead>
              <tbody>{data.daily.map((day) => <tr key={day.date}><th scope="row" className="p-2 font-normal">{day.date}</th><td className="p-2">{day.signups}</td><td className="p-2">{day.bookings}</td><td className="p-2">{day.orders}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </QueryState>}
    </div>
  </Screen>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-white rounded-xl border border-line p-3"><div className="text-xs text-muted">{label}</div><div className="font-display font-bold text-xl mt-1 break-words">{value}</div></div>
}

const SERIES = {
  marketplace_fees: { label: 'Marketplace fees', money: true },
  bookings: { label: 'Bookings', money: false },
  orders: { label: 'Orders', money: false },
  signups: { label: 'New accounts', money: false },
} as const
type Series = keyof typeof SERIES

/**
 * The next week from a seasonal model fitted to the selected days, with the
 * range it expects and how it did on the last week; and the days in the
 * period it did not expect.
 */
function ForecastSection({ daily }: { daily: AnalyticsReport['daily'] }) {
  const [series, setSeries] = useState<Series>('marketplace_fees')
  const history = daily.map((d) => ({ date: d.date, value: Number(d[series]) }))
  const f = forecast(history)
  const unusual = anomalies(history)
  const show = (n: number) => (SERIES[series].money ? formatNaira(n) : n.toLocaleString('en-NG'))
  return (
    <div>
      <h3 className="font-semibold text-lg">The next 7 days</h3>
      <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Figure to forecast">
        {(Object.keys(SERIES) as Series[]).map((key) => (
          <button key={key} onClick={() => setSeries(key)} aria-pressed={series === key}
            className={`rounded-full px-3.5 py-1.5 text-[13px] ${series === key ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink'}`}>{SERIES[key].label}</button>
        ))}
      </div>
      {!f ? <p className="text-sm text-muted mt-2">Choose a range of at least 14 days to see a forecast.</p> : (
        <>
          <p className="text-sm text-muted mt-2">
            About {show(f.days.reduce((sum, d) => sum + d.value, 0))} in total. A seasonal model (Holt-Winters, with a weekly rhythm) fitted to the selected days; each day shows the range it expects four times in five. It learns from these days only: a coming promotion, outage or holiday is not in it.
          </p>
          <div className="grid grid-cols-7 gap-1.5 mt-3 text-center">
            {f.days.map((d) => (
              <div key={d.date} className="bg-white border border-line rounded-lg py-2 px-0.5">
                <div className="text-[10.5px] text-muted">{d.date.slice(5)}</div>
                <div className="text-[12px] font-semibold text-ink mt-0.5 break-words">{show(d.value)}</div>
                <div className="text-[9.5px] text-muted-2 mt-0.5 break-words">{show(d.low)}–{show(d.high)}</div>
              </div>
            ))}
          </div>
          {f.backtest && (
            <p className="text-[13px] text-muted mt-2">
              Checked on the last 7 days, predicted from the weeks before: off by {show(f.backtest.mae)} a day on average{f.backtest.mape !== null ? ` (${f.backtest.mape}%)` : ''}, against {show(f.backtest.baseline_mae)} for simply repeating the week before.
              {f.backtest.mae > f.backtest.baseline_mae && ' On this period the simple repeat did better, so treat the forecast with care.'}
            </p>
          )}
        </>
      )}
      {unusual.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-semibold text-ink">Days the model did not expect</div>
          <ul className="mt-1 space-y-1 text-[13px] text-muted">
            {unusual.slice(-8).map((a) => <li key={a.date}>{a.date}: {show(a.value)}, {a.direction === 'high' ? 'well above' : 'well below'} the {show(a.expected)} expected</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

type AnalystAnswer = { answer: string; figures: string[]; caveats: string[] }

/**
 * Questions about the figures, answered by Claude from the same reports this
 * page shows, read on the server with the asker's own permissions.
 */
function Analyst({ from, through }: { from: string; through: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<AnalystAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function ask(q: string) {
    setBusy(true); setError(null); setAnswer(null)
    try { setAnswer(await askAssistant<AnalystAnswer>('analytics', { from, through, question: q })) }
    catch (err) { setError(err instanceof AssistantUnavailable ? 'The analyst is not set up yet: it needs the assistant\'s API key (see the README).' : (err as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="bg-white rounded-xl border border-line p-4">
      <h3 className="font-semibold text-lg">Ask the analyst</h3>
      <p className="text-sm text-muted mt-1">Answers come only from this period's figures, the forecast and the unusual days above. It says when the figures cannot answer.</p>
      <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); if (question.trim().length >= 3) void ask(question.trim()) }}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Why did orders drop last week?" aria-label="Question about the figures"
          className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 text-[14px] text-ink outline-none" />
        <button type="submit" disabled={busy || question.trim().length < 3} className="px-4 h-11 bg-ink text-cream rounded-lg text-[14px] font-semibold disabled:opacity-50">Ask</button>
      </form>
      <button className="min-h-11 text-[14px] font-semibold text-brand-hover" disabled={busy} onClick={() => void ask('Summarise this period: what stands out, what changed, the unusual days, and what to watch next.')}>
        {busy ? 'Reading the figures…' : 'Summarise this period'}
      </button>
      {error && <p role="alert" className="text-sm text-brand mt-1">{error}</p>}
      {answer && (
        <div className="mt-2 space-y-2 text-[14px] leading-[1.55] text-ink">
          <p className="whitespace-pre-line">{answer.answer}</p>
          {answer.figures.length > 0 && <ul className="list-disc pl-5 text-[13px] text-muted">{answer.figures.map((f) => <li key={f}>{f}</li>)}</ul>}
          {answer.caveats.length > 0 && <p className="text-[12.5px] text-muted-2">Caveats: {answer.caveats.join(' ')}</p>}
        </div>
      )}
    </div>
  )
}

const FUNNEL_LABEL: Record<string, string> = {
  viewed_a_provider: 'Viewed a provider', picked_a_time: 'Picked a time', reached_payment: 'Reached payment', booked: 'Booked',
  viewed_a_product: 'Viewed a product', opened_the_cart: 'Opened the cart', reached_checkout: 'Reached checkout', ordered: 'Ordered',
}

/** How people use the app: screens, the paths to booking and buying, who came back, and where the work is. */
function Engagement({ from, through }: { from: string; through: string }) {
  const report = useEngagement(from, through)
  return (
    <QueryState query={report} errorMessage="We could not load engagement." skeletonRows={2}>
      {(e) => (
        <>
          <h3 className="font-semibold text-lg">How the app is used</h3>
          <p className="text-sm text-muted">From people who have not opted out of usage analytics. Screens are recorded by kind, never by whose profile or order it was.</p>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Visits (sessions)" value={e.sessions} />
            <Metric label="Screens opened" value={e.page_views} />
            <Metric label="People recorded" value={e.people} />
            <Metric label="Back after a week" value={e.retention.new_accounts ? `${Math.round((e.retention.back_after_a_week / e.retention.new_accounts) * 100)}% of ${e.retention.new_accounts}` : 'No new accounts old enough'} />
            <Metric label="Providers active" value={e.segments.providers} />
            <Metric label="Riders active" value={e.segments.riders} />
            <Metric label="Business buyers active" value={e.segments.business_buyers} />
            <Metric label="ID-verified active" value={e.segments.verified} />
          </div>
          <Funnel title="From looking to booking" steps={e.booking_funnel} />
          <Funnel title="From browsing to ordering" steps={e.shopping_funnel} />
          <h3 className="font-semibold text-lg">Bookings in this period</h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Created" value={e.bookings.created} />
            <Metric label="Completed" value={e.bookings.completed} />
            <Metric label="Cancelled" value={e.bookings.cancelled} />
            <Metric label="Rescheduled" value={e.bookings.rescheduled} />
            <Metric label="Average value" value={formatNaira(e.bookings.average_value)} />
            <Metric label="Deliveries completed" value={e.marketplace.deliveries_completed} />
          </div>
          <Breakdown title="Bookings by trade" rows={e.bookings.by_category.map((c) => [c.category, `${c.bookings} · ${formatNaira(c.value)}`])} />
          <Breakdown title="Bookings by area" rows={e.bookings.by_area.map((a) => [a.area, String(a.bookings)])} />
          <h3 className="font-semibold text-lg">Marketplace in this period</h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Orders placed, value" value={formatNaira(e.marketplace.orders_value)} />
            <Metric label="Coupon discounts given" value={formatNaira(e.marketplace.discounts_given)} />
            <Metric label="Wholesale paid to suppliers" value={formatNaira(e.marketplace.wholesale_value)} />
            <Metric label="Paid to riders" value={formatNaira(e.marketplace.rider_payouts)} />
          </div>
          <Breakdown title="Top sellers by goods sold" rows={e.marketplace.top_sellers.map((s) => [s.seller, `${s.orders} · ${formatNaira(s.value)}`])} />
          <Breakdown title="Most opened screens" rows={e.top_screens.map((s) => [s.path, `${s.views} · ${s.people} people`])} />
        </>
      )}
    </QueryState>
  )
}

function Funnel({ title, steps }: { title: string; steps: EngagementReport['booking_funnel'] }) {
  const entries = Object.keys(FUNNEL_LABEL).filter((k) => k in steps).map((k) => [k, steps[k]] as const)
  const top = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      <p className="text-xs text-muted">People who reached each step. The last step counts everyone who did it, recorded or not, so it can exceed the one before.</p>
      <div className="space-y-1.5 mt-2">
        {entries.map(([key, n]) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="w-36 text-muted">{FUNNEL_LABEL[key]}</span>
            <span className="flex-1 h-2 rounded-full bg-line-soft overflow-hidden"><span className="block h-full bg-brand" style={{ width: `${(n / top) * 100}%` }} /></span>
            <span className="w-10 text-right font-semibold text-ink">{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: [string, string][] }) {
  if (rows.length === 0) return null
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold py-2">{title} ({rows.length})</summary>
      <ul className="space-y-1">{rows.map(([label, value]) => <li key={label} className="flex justify-between gap-3"><span className="truncate text-ink">{label}</span><span className="text-muted whitespace-nowrap">{value}</span></li>)}</ul>
    </details>
  )
}
