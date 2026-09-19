import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'

/** The frame around every page: the navigation bar and the current route's page */
export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    navigate('/login')
  }

  return (
    <>
      <header className="app-header">
        <nav className="app-nav">
          <Link to="/" className="brand">
            Image Collections
          </Link>
          {user && <NavLink to="/" end>My collections</NavLink>}
          <span className="spacer" />
          {user ? (
            <>
              <span>Signed in as {user.username}</span>
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/signup">Sign up</NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
