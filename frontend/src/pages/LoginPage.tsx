import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { ErrorMessage, Spinner } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { errorMessage } from '../lib/errors'

interface LoginPageProps {
  mode: 'login' | 'signup'
}

/** Log in, or create an account. Afterwards, returns the user to the page that sent them here. */
export function LoginPage({ mode }: LoginPageProps) {
  const { user, ready, login, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // RequireAuth passes the page the user was trying to open
  const from = (location.state as { from?: Location } | null)?.from
  const destination = from ? `${from.pathname}${from.search}` : '/'
  const isSignUp = mode === 'signup'

  if (ready && user) {
    return <Navigate to={destination} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await (isSignUp ? signUp : login)(username, password)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="intro">
          <span className="brand-mark lg">
            <Icon name="image" size={24} strokeWidth={2.25} />
          </span>
          <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">
            {isSignUp ? 'Start collecting and sharing photos in seconds.' : 'Log in to see your collections.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            Username
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
            {submitting && <Spinner />}
            {isSignUp ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="switch">
          {isSignUp ? 'Already have an account? ' : 'New here? '}
          {/* Keep the redirect target when switching between the two forms */}
          <Link to={isSignUp ? '/login' : '/signup'} state={location.state}>
            {isSignUp ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </div>
  )
}
