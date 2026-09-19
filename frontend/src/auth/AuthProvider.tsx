import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as AuthApi from '../api/auth'
import { onSessionChange, refreshSession } from '../api/client'
import type { User } from '../api/types'
import { AuthContext, type AuthState } from './auth-context'

/** Restores the session on page load and keeps the current user in sync with the API client */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // The client reports every login, refresh and logout, including a session that expires mid-use
    const unsubscribe = onSessionChange(setUser)
    refreshSession().finally(() => setReady(true))
    return unsubscribe
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: async (username, password) => {
        await AuthApi.login(username, password)
      },
      signUp: async (username, password) => {
        await AuthApi.signUp(username, password)
      },
      logout: AuthApi.logout,
    }),
    [user, ready],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
