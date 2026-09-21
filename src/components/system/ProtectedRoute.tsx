import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/authContext'
import { FullScreenLoader } from './States'

/**
 * Gate for every screen behind sign-in. Before this existed every route was
 * public — /wallet rendered for anyone who typed the URL.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />

  return <>{children}</>
}

/** Inverse guard: keeps a signed-in user out of the onboarding screens. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/home" replace />

  return <>{children}</>
}
