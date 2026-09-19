import type { Session, User } from './types'

/** Where the backend runs. Set VITE_API_URL in frontend/.env.local to point elsewhere. */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** An error response from the API, carrying the server's message */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// The access token lives only in memory. The refresh token is an HttpOnly cookie the browser sends
// to /api/auth, so a page reload restores the session through refreshSession().
let accessToken: string | null = null

type SessionListener = (user: User | null) => void
const listeners = new Set<SessionListener>()

/** Calls the listener whenever the user logs in, refreshes, or the session ends */
export const onSessionChange = (listener: SessionListener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stores a new session (or clears it with null) and tells the listeners */
export const setSession = (session: Session | null): void => {
  accessToken = session?.accessToken ?? null
  listeners.forEach(listener => listener(session?.user ?? null))
}

// Refresh tokens rotate on every use, and the server ends the whole session if an old one comes
// back. So concurrent callers (or StrictMode running an effect twice) must share one request.
let refreshing: Promise<Session | null> | null = null

/**
 * Trades the refresh cookie for a new access token.
 * @returns The new session, or null if there is no valid session
 */
export const refreshSession = (): Promise<Session | null> => {
  refreshing ??= fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async res => (res.ok ? ((await res.json()) as Session) : null))
    .catch(() => null)
    .then(session => {
      setSession(session)
      return session
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type Query = Record<string, string | number | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  data: T
  headers: Headers
}

const buildUrl = (path: string, query?: Query): string => {
  const url = new URL(`${API_URL}/api${path}`)
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url.href
}

const send = (path: string, options: RequestOptions): Promise<Response> => {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  })
}

const readError = async (res: Response): Promise<ApiError> => {
  let message = res.statusText || 'Request failed'
  try {
    const body = (await res.json()) as { message?: string }
    message = body.message ?? message
  } catch {
    // Not JSON; keep the status text
  }
  return new ApiError(res.status, message)
}

/**
 * Calls the API. An expired access token is refreshed once and the request retried.
 * @throws {ApiError} for any response that is not 2xx
 */
export const request = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
  let res = await send(path, options)

  if (res.status === 401 && accessToken) {
    const session = await refreshSession()
    if (session) {
      res = await send(path, options)
    }
  }

  if (!res.ok) {
    throw await readError(res)
  }
  const data = (res.status === 204 ? undefined : await res.json()) as T
  return { data, headers: res.headers }
}

/** Reads the X-Total-Count header the API sends with paged lists */
export const totalCount = (headers: Headers): number | null => {
  const value = headers.get('X-Total-Count')
  return value === null ? null : Number(value)
}
