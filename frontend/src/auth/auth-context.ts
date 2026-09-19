import { createContext, useContext } from 'react'
import type { User } from '../api/types'

export interface AuthState {
  /** The logged-in user, or null */
  user: User | null
  /** False until the saved session (if any) has been restored on page load */
  ready: boolean
  login: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

/** The current user and the actions that change it. Must be used inside <AuthProvider>. */
export const useAuth = (): AuthState => {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return auth
}
