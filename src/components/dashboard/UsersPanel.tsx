import { useState, type FormEvent } from 'react'
import { Loader2, ShieldPlus, UserPlus } from 'lucide-react'
import { createAppUser } from '../../lib/auth'
import { useAppStore } from '../../store/useStore'
import type { UserRole } from '../../types'

export function UsersPanel() {
  const users = useAppStore((s) => s.users)
  const setUsers = useAppStore((s) => s.setUsers)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    const { user, error: createError } = await createAppUser({
      name,
      username,
      password,
      role,
    })
    setLoading(false)
    if (createError || !user) {
      setError(createError ?? 'Could not create user')
      return
    }
    setUsers([...users.filter((u) => u.id !== user.id), user])
    setSuccess(`Created ${user.username} (${user.role})`)
    setName('')
    setUsername('')
    setPassword('')
    setRole('user')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldPlus className="h-5 w-5 text-[var(--modi-red)]" />
          <h3 className="font-display text-base font-semibold">Team accounts</h3>
        </div>
        <ul className="divide-y divide-zinc-100">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {u.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  @{u.username} · {u.email}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  u.role === 'admin'
                    ? 'bg-[var(--modi-red-soft)] text-[var(--modi-red)]'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {u.role}
              </span>
            </li>
          ))}
          {users.length === 0 && (
            <li className="py-6 text-center text-sm text-zinc-500">
              No users loaded yet.
            </li>
          )}
        </ul>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-[var(--modi-red)]" />
          <h3 className="font-display text-base font-semibold">
            Add user / admin
          </h3>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          Only people with these credentials can open the app. Give the username
          and password to staff in person — do not share publicly.
        </p>

        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Display name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mb-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
          placeholder="Ramesh Kumar"
        />

        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          pattern="[A-Za-z0-9._-]{3,32}"
          title="3–32 letters, numbers, . _ -"
          className="mb-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
          placeholder="Ramesh"
        />

        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Temporary password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="mb-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
          placeholder="At least 8 characters"
        />

        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="mb-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--modi-red)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>
    </div>
  )
}
