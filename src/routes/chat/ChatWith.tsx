import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { ErrorState, FullScreenLoader } from '../../components/system/States'
import { useOpenThread } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'

/**
 * /chat/with/:profileId — "message this person". Finds or creates the thread
 * with them, then replaces itself with /chat/:threadId so back skips it.
 */
export function ChatWith() {
  const { profileId } = useParams<{ profileId: string }>()
  const { mutateAsync: open } = useOpenThread()
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    open(profileId)
      .then((id) => !cancelled && setThreadId(id))
      .catch((err) => !cancelled && setError(friendlyError(err)))
    return () => {
      cancelled = true
    }
  }, [profileId, open])

  if (threadId) return <Navigate to={`/chat/${threadId}`} replace />
  if (error) {
    return (
      <Screen>
        <PageHeader title="Messages" back="/messages" />
        <ErrorState message={error} />
      </Screen>
    )
  }
  return <FullScreenLoader />
}
