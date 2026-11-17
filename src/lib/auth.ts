import type { User, UserRole } from '../types'
import { useAppStore } from '../store/useStore'

const SESSION_KEY = 'modi-local-session-v1'

type StoredSession = {
  token: string
  user: User
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function getApiBase(): string {
  const fromStore = useAppStore.getState().dbUrl?.trim()
  if (fromStore) return normalizeBaseUrl(fromStore)
  const fromEnv = (import.meta.env.VITE_MODI_API_URL as string | undefined)?.trim()
  if (fromEnv) return normalizeBaseUrl(fromEnv)
  return 'http://127.0.0.1:8787'
}

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed?.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function saveStoredSession(session: StoredSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: string }).error)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return body as T
}

export async function signInWithUsername(
  username: string,
  password: string,
): Promise<{ error: string | null }> {
  try {
    const base = getApiBase()
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await parseJson<{ token: string; user: User }>(res)
    saveStoredSession({ token: data.token, user: data.user })
    useAppStore.getState().setDbFields(base, data.token)
    return { error: null }
  } catch (err) {
    return { error: String((err as Error).message || err) }
  }
}

export async function bootstrapAdmin(input: {
  username: string
  password: string
  name: string
}): Promise<{ error: string | null }> {
  try {
    const base = getApiBase()
    const res = await fetch(`${base}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await parseJson<{ token: string; user: User }>(res)
    saveStoredSession({ token: data.token, user: data.user })
    useAppStore.getState().setDbFields(base, data.token)
    return { error: null }
  } catch (err) {
    return { error: String((err as Error).message || err) }
  }
}

export async function signOut(): Promise<void> {
  const session = loadStoredSession()
  const base = getApiBase()
  const token = session?.token || useAppStore.getState().dbKey
  if (token) {
    try {
      await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Modi-Token': token,
        },
      })
    } catch {
      /* ignore offline logout */
    }
  }
  saveStoredSession(null)
  useAppStore.getState().setCurrentUserId('')
  useAppStore.getState().setUsers([])
  useAppStore.getState().setAuthReady(true)
}

export async function fetchProfile(userId: string): Promise<User | null> {
  const session = loadStoredSession()
  if (session?.user?.id === userId) return session.user
  const me = await fetchMe()
  return me?.id === userId ? me : me
}

export async function fetchMe(): Promise<User | null> {
  const session = loadStoredSession()
  const token = session?.token || useAppStore.getState().dbKey
  if (!token) return null
  const base = getApiBase()
  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Modi-Token': token,
      },
    })
    const data = await parseJson<{ user: User }>(res)
    saveStoredSession({ token, user: data.user })
    return data.user
  } catch {
    return session?.user ?? null
  }
}

export async function fetchAllUsers(): Promise<User[]> {
  const session = loadStoredSession()
  const token = session?.token || useAppStore.getState().dbKey
  if (!token) return []
  const base = getApiBase()
  const res = await fetch(`${base}/api/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Modi-Token': token,
    },
  })
  const data = await parseJson<{ users: User[] }>(res)
  return data.users || []
}

export async function createAppUser(input: {
  username: string
  password: string
  name: string
  role: UserRole
}): Promise<{ user: User | null; error: string | null }> {
  try {
    const session = loadStoredSession()
    const token = session?.token || useAppStore.getState().dbKey
    if (!token) return { user: null, error: 'Not signed in.' }
    const base = getApiBase()
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Modi-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
    const data = await parseJson<{ user: User }>(res)
    return { user: data.user, error: null }
  } catch (err) {
    return { user: null, error: String((err as Error).message || err) }
  }
}

export async function healthHasUsers(): Promise<boolean | null> {
  try {
    const base = getApiBase()
    const res = await fetch(`${base}/health`)
    if (!res.ok) return null
    const data = (await res.json()) as { userCount?: number }
    return Number(data.userCount || 0) > 0
  } catch {
    return null
  }
}
