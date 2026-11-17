import { LogOut, RotateCcw, Zap } from 'lucide-react'
import clsx from 'clsx'
import {
  Bell,
  Building2,
  Database,
  FileScan,
  LayoutDashboard,
} from 'lucide-react'
import { useAppStore } from '../../store/useStore'
import { useCurrentUser, useUnreadCount } from '../../hooks/useAppData'
import { signOut } from '../../lib/auth'
import type { PageId } from '../../types'

const NAV: {
  id: PageId
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'parties', label: 'Parties', icon: Building2 },
  { id: 'scan', label: 'Scan PDF', icon: FileScan },
  { id: 'database', label: 'Database', icon: Database },
]

export function Sidebar() {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const currentUser = useCurrentUser()
  const unread = useUnreadCount()
  const resetDemoData = useAppStore((s) => s.resetDemoData)
  const demoMode = useAppStore((s) => s.demoMode)
  const users = useAppStore((s) => s.users)
  const switchUser = useAppStore((s) => s.switchUser)
  const exitLocalDemo = useAppStore((s) => s.exitLocalDemo)
  const isAdmin = currentUser?.role === 'admin'

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--modi-border)] bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--modi-red)] text-white shadow-sm">
          <Zap className="h-5 w-5" strokeWidth={2.4} />
        </div>
        <div>
          <p className="font-display text-[15px] leading-tight font-bold tracking-tight text-[var(--modi-red)]">
            MODI
          </p>
          <p className="font-display text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">
            Electricals
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
          Management
        </p>
        <ul className="space-y-1">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon
            const active =
              page === item.id || (item.id === 'parties' && page === 'party')
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    active
                      ? 'bg-[var(--modi-red-soft)] text-[var(--modi-red)]'
                      : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === 'parties' && unread > 0 && (
                    <span className="rounded-full bg-[var(--modi-red)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-zinc-100 p-3">
        {demoMode && (
          <label className="mb-2 block">
            <span className="mb-1 block px-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              Demo role
            </span>
            <select
              value={currentUser?.id ?? ''}
              onChange={(e) => switchUser(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 outline-none focus:border-[var(--modi-red)]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => void resetDemoData()}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset / clear data
        </button>
        <button
          type="button"
          onClick={() => {
            if (demoMode) exitLocalDemo()
            else void signOut()
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--modi-red-soft)] px-3 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--modi-red)] text-xs font-bold text-white">
            {(currentUser?.name ?? '?')
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {currentUser?.name ?? '—'}
            </p>
            <p className="truncate text-[11px] text-zinc-500">
              @{currentUser?.username ?? '—'} · {currentUser?.role ?? ''}
              {demoMode ? ' · demo' : ''}
            </p>
          </div>
          <Bell className="ml-auto h-4 w-4 shrink-0 text-[var(--modi-red)]" />
        </div>
      </div>
    </aside>
  )
}
