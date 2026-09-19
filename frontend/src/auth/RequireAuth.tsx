import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context'

/**
 * Route guard: renders the child routes for a logged-in user, otherwise sends them to the login
 * page, remembering where they were going so login can bring them back.
 */
export function RequireAuth() {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return <p>Loading…</p>
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}
