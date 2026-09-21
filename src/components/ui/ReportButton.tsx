import { useState } from 'react'
import { useReport } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import type { ReportTargetType } from '../../lib/database.types'

const REASONS = ['Scam or fraud', 'Offensive or abusive', 'Prohibited item', 'Misleading', 'Something else']

/** "Report" link that expands into a reason picker and files it for a moderator. */
export function ReportButton({
  targetType,
  targetId,
  label = 'Report',
  className = '',
}: {
  targetType: ReportTargetType
  targetId: string
  label?: string
  className?: string
}) {
  const report = useReport()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (report.isSuccess) {
    return (
      <div className={`flex items-center gap-1.5 text-[13.5px] text-success-text ${className}`}>
        <i className="ph-fill ph-check-circle" />
        Reported. Our team will take a look.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted ${className}`}
      >
        <i className="ph ph-flag" />
        {label}
      </button>
    )
  }

  return (
    <div className={`bg-white border border-line rounded-2xl p-4 ${className}`}>
      <div className="text-[14.5px] font-semibold text-ink">What is wrong?</div>
      <div className="flex flex-wrap gap-2 mt-3">
        {REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={report.isPending}
            onClick={() =>
              report.mutate(
                { targetType, targetId, reason },
                { onError: (e) => setError(friendlyError(e)) },
              )
            }
            className="rounded-full px-3.5 py-2 text-[13px] bg-cream border border-line text-ink font-medium disabled:opacity-50"
          >
            {reason}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      <button type="button" onClick={() => setOpen(false)} className="mt-3 text-[13.5px] font-semibold text-muted">
        Cancel
      </button>
    </div>
  )
}
