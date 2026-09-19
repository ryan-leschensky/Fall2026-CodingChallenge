import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { useAuth } from '../auth/auth-context'
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
    <section className="auth-page">
      <h1>{isSignUp ? 'Create an account' : 'Log in'}</h1>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          Username
          <input
            value={username}
            onChange={event => setUsername(event.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {isSignUp ? 'Sign up' : 'Log in'}
        </button>
      </form>
      <p>
        {isSignUp ? 'Already have an account? ' : 'New here? '}
        {/* Keep the redirect target when switching between the two forms */}
        <Link to={isSignUp ? '/login' : '/signup'} state={location.state}>
          {isSignUp ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </section>
  )
}
