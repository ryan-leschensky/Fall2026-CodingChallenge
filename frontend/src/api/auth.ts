import { request, setSession } from './client'
import type { Session, User } from './types'

/** Logs in and stores the session */
export const login = async (username: string, password: string): Promise<User> => {
  const { data } = await request<Session>('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  setSession(data)
  return data.user
}

/** Creates an account, then logs in to it */
export const signUp = async (username: string, password: string): Promise<User> => {
  await request<User>('/users', { method: 'POST', body: { username, password } })
  return login(username, password)
}

/** Ends the session on the server and forgets it here, even if the server could not be reached */
export const logout = async (): Promise<void> => {
  try {
    await request<void>('/auth/logout', { method: 'POST' })
  } finally {
    setSession(null)
  }
}
