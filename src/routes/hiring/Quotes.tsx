import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { QueryState } from '../../components/system/QueryState'
import { useMyJobs } from '../../lib/api'
import { agoPhrase, formatNaira } from '../../lib/format'

/** The jobs the signed-in user has posted, and how many quotes each has. */
export function Quotes() {
  const jobs = useMyJobs()

  return (
    <Screen>
      <PageHeader
        title="My posted jobs"
        back="/home"
        right={
          <Link to="/post-job" aria-label="Post a job" className="inline-flex items-center justify-center w-11 h-11 bg-brand rounded-xl text-white">
            <i className="ph-bold ph-plus text-xl" />
          </Link>
        }
      />
      <div className="px-[22px] pb-6">
        <QueryState
          query={jobs}
          errorMessage="We could not load your jobs."
          empty={{
            icon: 'ph-note-pencil',
            title: 'No jobs posted',
            body: 'Post what you need and providers will send you quotes.',
            action: (
              <Link to="/post-job" className="text-[15px] font-semibold text-brand-hover">
                Post a job
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map((job) => (
              <Card key={job.id} to={`/jobs/${job.id}`} active={job.status === 'open' && job.quote_count > 0} className="p-4 mt-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display font-semibold text-[16.5px] leading-[1.25] text-ink">{job.title}</span>
                  {job.status === 'open' ? (
                    <Badge tone={job.quote_count > 0 ? 'success' : 'warning'} icon={job.quote_count > 0 ? 'chat-circle-dots' : 'clock'}>
                      {job.quote_count > 0 ? `${job.quote_count} quote${job.quote_count === 1 ? '' : 's'}` : 'Waiting'}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Closed</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-line-soft text-[13.5px] text-muted-2">
                  <span>Posted {agoPhrase(job.created_at)}</span>
                  <span className="font-display font-bold text-[15px] text-ink">Budget {formatNaira(job.budget)}</span>
                </div>
              </Card>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}
