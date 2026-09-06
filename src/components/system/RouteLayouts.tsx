import { Outlet } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute'

/** Layout route: everything nested under it requires a session. */
export function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  )
}

/** Layout route: onboarding screens, redirected away once signed in. */
export function PublicOnlyLayout() {
  return (
    <PublicOnlyRoute>
      <Outlet />
    </PublicOnlyRoute>
  )
}
