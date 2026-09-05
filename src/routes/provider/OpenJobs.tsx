import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { Card } from '../../components/ui/Card'
import { openJobs, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function OpenJobs() {
  const sentQuotes = useAppStore((s) => s.sentQuotes)
  const quotedJobIds = new Set(sentQuotes.map((q) => q.jobId))
  return (
    <Screen bottomNav="provider">
      <StatusBar />
      <div className="px-[22px] pt-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Open jobs</h2>
          <span className="inline-flex items-center justify-center w-11 h-11 text-ink">
            <i className="ph ph-sliders-horizontal text-xl" />
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <i className="ph-fill ph-sparkle text-sm text-success" />
          <span className="text-[13.5px] text-muted">14 jobs match your skills and area</span>
        </div>

        <div className="flex gap-2 mt-3.5">
          <Chip active>Best match</Chip>
          <Chip>Nearest</Chip>
          <Chip>Highest pay</Chip>
        </div>

        {openJobs.map((job, i) => (
          <Card key={job.id} to={`/provider/jobs/${job.id}/quote`} active={i === 0} className="p-4 mt-4">
            <div className="flex items-start justify-between gap-3">
              <span className="font-display font-semibold text-[16.5px] leading-[1.25] text-ink">{job.title}</span>
              <span className="font-display font-bold text-[17px] text-ink whitespace-nowrap">{formatNaira(job.price)}</span>
            </div>
            <p className="mt-2 text-sm leading-[1.5] text-muted">{job.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="inline-flex items-center gap-1.5 bg-cream rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-text-soft">
                <i className="ph ph-map-pin text-xs" />
                {job.distanceKm} km
              </span>
              {job.dueBy && (
                <span className="inline-flex items-center gap-1.5 bg-cream rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-text-soft">
                  <i className="ph ph-calendar text-xs" />
                  {job.dueBy}
                </span>
              )}
              {job.verifiedBuyer && (
                <span className="inline-flex items-center gap-1.5 bg-success-bg text-success-text rounded-full px-2.5 py-1 text-[11.5px] font-bold">
                  <i className="ph-fill ph-shield-check" />
                  Verified buyer
                </span>
              )}
              {job.business && (
                <span className="inline-flex items-center gap-1.5 bg-success-bg text-success-text rounded-full px-2.5 py-1 text-[11.5px] font-bold">
                  <i className="ph-fill ph-buildings" />
                  Business
                </span>
              )}
              {job.quotes > 0 && (
                <span className="bg-danger-bg text-danger rounded-full px-2.5 py-1 text-[11.5px] font-bold">
                  {job.quotes} quotes so far
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-line-soft">
              <span className="text-[13.5px] text-muted-2">{job.postedAgo ? `Posted ${job.postedAgo}` : ' '}</span>
              {quotedJobIds.has(job.id) ? (
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-success-text">
                  <i className="ph-fill ph-check-circle" />
                  Quote sent
                </span>
              ) : (
                <span className="text-[15px] font-semibold text-brand-hover">Send a quote</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}
