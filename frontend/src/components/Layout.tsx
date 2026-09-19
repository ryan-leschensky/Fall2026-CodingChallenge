import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { Icon } from './Icon'

/** The frame around every page: the navigation bar and the current route's page */
export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    navigate('/login')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link')

  return (
    <>
      <div className="page-glow" aria-hidden="true" />
      <header className="app-header">
        <nav className="app-nav">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Icon name="image" size={18} strokeWidth={2.25} />
            </span>
            <span className="brand-name">Image Collections</span>
          </Link>
          {user && (
            <div className="nav-links">
              <NavLink to="/" end className={navLinkClass}>
                Collections
              </NavLink>
            </div>
          )}
          <span className="spacer" />
          {user ? (
            <div className="row">
              <span className="user-chip" title={`Signed in as ${user.username}`}>
                <span className="avatar sm">{user.username.charAt(0)}</span>
                <span className="username">{user.username}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                <Icon name="logOut" size={16} />
                Log out
              </button>
            </div>
          ) : (
            <div className="row">
              <NavLink to="/login" className="btn btn-ghost btn-sm">
                Log in
              </NavLink>
              <NavLink to="/signup" className="btn btn-primary btn-sm">
                Sign up
              </NavLink>
            </div>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">Photos provided by Pixabay</footer>
    </>
  )
}
