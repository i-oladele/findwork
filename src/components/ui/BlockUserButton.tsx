import { useState } from 'react'
import { useAuth } from '../../lib/authContext'
import { useBlockStatus, useSetUserBlocked } from '../../lib/api/blocks'
import { friendlyError } from '../../lib/supabase'

export function BlockUserButton({ profileId }: { profileId: string }) {
  const { user } = useAuth()
  const status = useBlockStatus(profileId)
  const change = useSetUserBlocked(profileId)
  const [confirming, setConfirming] = useState(false)
  if (!user || user.id === profileId) return null
  return (
    <div className="text-[13.5px]">
      {status.isError ? (
        <button type="button" onClick={() => void status.refetch()} className="min-h-11 font-semibold text-danger">Could not load blocking controls. Retry</button>
      ) : confirming ? (
        <div className="rounded-xl border border-line bg-white p-3">
          <p>Blocking stops new messages between you and hides their stories and live streams. Existing bookings, payments and disputes remain available.</p>
          <div className="flex gap-4 mt-2">
            <button type="button" disabled={change.isPending} className="min-h-11 font-semibold text-danger disabled:opacity-50"
              onClick={() => change.mutate(true, { onSuccess: () => setConfirming(false) })}>Confirm block</button>
            <button type="button" disabled={change.isPending} className="min-h-11 font-semibold text-muted" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!status.data || change.isPending} className="min-h-11 font-semibold text-danger disabled:opacity-50"
          onClick={() => status.data?.mine ? change.mutate(false) : setConfirming(true)}>
          {status.data?.mine ? 'Unblock user' : 'Block user'}
        </button>
      )}
      {change.isError && <p role="alert" className="text-danger">{friendlyError(change.error)}</p>}
    </div>
  )
}
