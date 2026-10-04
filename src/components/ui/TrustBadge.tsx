import { Badge } from './Badge'
import { TIER_LABEL } from '../../lib/api/trust'

/**
 * What FindWork has confirmed about an account, and its trust score out of
 * 100. Shown wherever someone decides whether to deal with a stranger.
 */
export function TrustBadge({ tier, score }: { tier: number | null | undefined; score: number | null | undefined }) {
  const level = Math.min(3, Math.max(0, tier ?? 0))
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={level >= 2 ? 'success' : 'neutral'} icon={level >= 2 ? 'shield-check' : undefined}>{TIER_LABEL[level]}</Badge>
      {typeof score === 'number' && <Badge tone={score >= 60 ? 'success' : score >= 30 ? 'neutral' : 'warning'}>Trust {score}</Badge>}
    </span>
  )
}
