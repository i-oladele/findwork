import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Card } from '../../components/ui/Card'
import { QueryState } from '../../components/system/QueryState'
import { RequireProvider } from '../../components/system/RequireProvider'
import { useMySentQuotes, useOpenJobs } from '../../lib/api'
import { agoPhrase, formatNaira } from '../../lib/format'

export function OpenJobs() {
  return <RequireProvider>{() => <JobList />}</RequireProvider>
}

function JobList() {
  const jobs = useOpenJobs()
  const { data: sent } = useMySentQuotes()
  const quoted = new Set((sent ?? []).map((q) => q.job_id))

  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Open jobs</h2>
        <p className="text-[13.5px] text-muted mt-1.5">Jobs customers have posted. Send a quote; if they accept, it is booked and paid into escrow.</p>

        <QueryState
          query={jobs}
          errorMessage="We could not load open jobs."
          empty={{ icon: 'ph-briefcase', title: 'No open jobs right now', body: 'New jobs appear here as customers post them.' }}
        >
          {(list) =>
            list.map((job) => (
              <Card key={job.id} to={`/provider/jobs/${job.id}/quote`} className="p-4 mt-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display font-semibold text-[16.5px] leading-[1.25] text-ink">{job.title}</span>
                  <span className="font-display font-bold text-[17px] text-ink whitespace-nowrap">{formatNaira(job.budget)}</span>
                </div>
                <p className="mt-2 text-sm leading-[1.5] text-muted line-clamp-3">{job.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {job.needed_by && (
                    <span className="inline-flex items-center gap-1.5 bg-cream rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-text-soft">
                      <i className="ph ph-calendar text-xs" />
                      By {job.needed_by}
                    </span>
                  )}
                  {job.quote_count > 0 && (
                    <span className="bg-danger-bg text-danger rounded-full px-2.5 py-1 text-[11.5px] font-bold">
                      {job.quote_count} quote{job.quote_count === 1 ? '' : 's'} so far
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-line-soft">
                  <span className="text-[13.5px] text-muted-2">Posted {agoPhrase(job.created_at)}</span>
                  {quoted.has(job.id) ? (
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-success-text">
                      <i className="ph-fill ph-check-circle" />
                      Quote sent
                    </span>
                  ) : (
                    <span className="text-[15px] font-semibold text-brand-hover">Send a quote</span>
                  )}
                </div>
              </Card>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}
