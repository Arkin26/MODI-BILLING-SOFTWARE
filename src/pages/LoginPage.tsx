import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Lock, Zap } from 'lucide-react'
import {
  bootstrapAdmin,
  healthHasUsers,
  loadStoredSession,
  signInWithUsername,
} from '../lib/auth'
import { useAppStore } from '../store/useStore'
import type { User } from '../types'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('Administrator')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [checking, setChecking] = useState(true)
  const [apiReachable, setApiReachable] = useState(false)

  const setUsers = useAppStore((s) => s.setUsers)
  const setCurrentUserId = useAppStore((s) => s.setCurrentUserId)
  const setAuthReady = useAppStore((s) => s.setAuthReady)
  const dbUrl = useAppStore((s) => s.dbUrl)
  const setDbFields = useAppStore((s) => s.setDbFields)
  const tryConnectDb = useAppStore((s) => s.tryConnectDb)
  const enterLocalDemo = useAppStore((s) => s.enterLocalDemo)

  useEffect(() => {
    if (!dbUrl.trim()) {
      setDbFields('http://127.0.0.1:8787', useAppStore.getState().dbKey)
    }
  }, [dbUrl, setDbFields])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hasUsers = await healthHasUsers()
      if (cancelled) return
      setApiReachable(hasUsers !== null)
      setNeedsBootstrap(hasUsers === false)
      setChecking(false)
      if (hasUsers === null) {
        setError(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function finishLogin() {
    const stored = loadStoredSession()
    if (!stored) return
    let team: User[] = [stored.user]
    setUsers(team)
    setCurrentUserId(stored.user.id)
    setAuthReady(true)
    await tryConnectDb({ pushLocalIfEmpty: false })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = needsBootstrap
      ? await bootstrapAdmin({
          username,
          password,
          name: name.trim() || 'Administrator',
        })
      : await signInWithUsername(username, password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    await finishLogin()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--modi-bg)] p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--modi-red)] text-white shadow-sm">
            <Zap className="h-7 w-7" strokeWidth={2.4} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--modi-red)]">
            MODI ELECTRICALS
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Local login — accounts stay on this office PC
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <Lock className="h-4 w-4 text-[var(--modi-red)]" />
            {needsBootstrap ? 'Create first admin' : 'Staff login'}
          </div>

          {needsBootstrap && (
            <>
              <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                No users yet. Create the first admin account. It is stored only in
                local Postgres on this PC.
              </p>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Display name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mb-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--modi-red)]"
                placeholder="Administrator"
              />
            </>
          )}

          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            pattern="[A-Za-z0-9._-]{3,32}"
            className="mb-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--modi-red)]"
            placeholder={needsBootstrap ? 'admin' : 'AnmolModi'}
          />

          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
            required
            minLength={8}
            className="mb-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--modi-red)]"
            placeholder="At least 8 characters"
          />

          {error && (
            <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || checking || !apiReachable}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--modi-red)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {(loading || checking) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {needsBootstrap ? 'Create admin & sign in' : 'Sign in'}
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-100" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-white px-2 text-zinc-400">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => enterLocalDemo('admin')}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
          >
            Continue without database (demo)
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-400">
            Try scan, approve, and collection flows in this browser. Data is not
            saved to Postgres and can be cleared anytime.
          </p>
        </form>
      </div>
    </div>
  )
}
