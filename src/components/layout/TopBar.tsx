import { useEffect, useRef, useState } from 'react'
import { Bell, HelpCircle, Search, Settings, Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '../../store/useStore'
import { useUnreadCount } from '../../hooks/useAppData'
import { useNetworkStatus } from '../../lib/network'
import { NotificationPanel } from '../notifications/NotificationPanel'

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  parties: 'Parties',
  party: 'Party account',
  scan: 'Scan PDF',
  database: 'Database',
}

export function TopBar() {
  const page = useAppStore((s) => s.page)
  const search = useAppStore((s) => s.search)
  const setSearch = useAppStore((s) => s.setSearch)
  const setPage = useAppStore((s) => s.setPage)
  const unread = useUnreadCount()
  const dbConnected = useAppStore((s) => s.dbConnected)
  const setNetworkOnline = useAppStore((s) => s.setNetworkOnline)
  const { online } = useNetworkStatus()
  const [openNotifs, setOpenNotifs] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const current = useAppStore.getState().networkOnline
    if (current !== online) setNetworkOnline(online)
  }, [online, setNetworkOnline])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenNotifs(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <header className="flex items-center gap-4 border-b border-[var(--modi-border)] bg-white/90 px-6 py-3 backdrop-blur">
      <div className="min-w-[160px]">
        <p className="text-xs text-zinc-400">
          Pages <span className="text-zinc-300">/</span>{' '}
          <span className="text-zinc-600">{TITLES[page]}</span>
        </p>
        <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900">
          {TITLES[page]}
        </h1>
      </div>

      <div className="relative mx-auto w-full max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parties, GSTIN, phone..."
          className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2.5 pr-4 pl-10 text-sm outline-none transition focus:border-[var(--modi-red)] focus:bg-white"
        />
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${
            online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
          title={online ? 'Network online' : 'Offline'}
        >
          {online ? (
            <Wifi className="h-3.5 w-3.5" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          {online ? 'Online' : 'Offline'}
        </span>

        <span
          className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold md:inline-flex ${
            dbConnected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              dbConnected ? 'bg-emerald-500' : 'bg-zinc-400'
            }`}
          />
          {dbConnected ? 'Office DB' : 'Local cache'}
        </span>

        <button
          type="button"
          className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>

        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpenNotifs((v) => !v)}
            className="relative rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--modi-red)] px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          {openNotifs && (
            <NotificationPanel onClose={() => setOpenNotifs(false)} />
          )}
        </div>

        <button
          type="button"
          onClick={() => setPage('database')}
          className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
