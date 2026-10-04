import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/authContext'
import { destination, forgetDestination, rememberDestination, storedDestination } from '../../lib/destination'
import { FullScreenLoader } from './States'
import { MfaChallenge } from './MfaChallenge'
import { Suspended } from './Suspended'
import { useProfile } from '../../lib/api/profile'
import { useAssurance } from '../../lib/api/mfa'
import { useSignInRecorder } from '../../lib/api/security'

/**
 * Gate for every screen behind sign-in. Before this existed every route was
 * public — /wallet rendered for anyone who typed the URL.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const here = location.pathname + location.search
  const assurance = useAssurance()
  const profile = useProfile()
  // Nothing is recorded until the second step, if there is one, is passed.
  useSignInRecorder(assurance.data !== undefined && !assurance.data.needsChallenge)

  // Arrived where they were headed: nothing left to remember.
  useEffect(() => {
    if (session && storedDestination() === here) forgetDestination()
  }, [session, here])

  if (loading) return <FullScreenLoader />
  if (!session) {
    // A link opened from outside the app (its first page) is kept, so signing
    // in or up brings them back to it. Pages left behind by signing out are not.
    if (location.key === 'default') rememberDestination(here)
    return <Navigate to="/welcome" replace />
  }
  if (assurance.data?.needsChallenge) return <MfaChallenge />
  if (profile.data?.suspended_at) return <Suspended reason={profile.data.suspended_reason} />

  return <>{children}</>
}

/** Inverse guard: keeps a signed-in user out of the onboarding screens. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to={destination()} replace />

  return <>{children}</>
}
