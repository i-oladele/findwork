import { useQuoteHistory } from '../../lib/api/marketplace'
import { QueryState } from '../system/QueryState'
import { formatDateTime, formatNaira } from '../../lib/format'

export function QuoteHistory({ quoteId }: { quoteId: string }) {
  const query = useQuoteHistory(quoteId)
  return <details className="mt-3 text-sm">
    <summary className="cursor-pointer py-3 font-semibold">Quote history</summary>
    <QueryState query={query} errorMessage="We could not load the quote history." skeletonRows={1}>
      {(history) => <ol className="space-y-3">{history.map((r) => <li key={r.revision} className="border-l-2 border-line pl-3">
        <div>Version {r.revision} · {r.status} · {formatNaira(r.price)} · {r.days} days{r.milestones?.length ? ` · ${r.milestones.length} stages` : ''}</div>
        {r.start_day && <p>Can start: {r.start_day}</p>}
        {r.message && <p className="text-muted whitespace-pre-wrap">{r.message}</p>}
        <p className="text-xs text-muted">{formatDateTime(r.recorded_at)}</p>
      </li>)}</ol>}
    </QueryState>
  </details>
}
