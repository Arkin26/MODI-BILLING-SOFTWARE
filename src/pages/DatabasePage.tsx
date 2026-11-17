import { Cloud, CloudOff, Link2, Loader2, Shield, Wifi } from 'lucide-react'
import { useAppStore } from '../store/useStore'

export function DatabasePage() {
  const dbUrl = useAppStore((s) => s.dbUrl)
  const dbKey = useAppStore((s) => s.dbKey)
  const dbConnected = useAppStore((s) => s.dbConnected)
  const dbConnecting = useAppStore((s) => s.dbConnecting)
  const dbMessage = useAppStore((s) => s.dbMessage)
  const liveSyncStatus = useAppStore((s) => s.liveSyncStatus)
  const dbRevision = useAppStore((s) => s.dbRevision)
  const setDbFields = useAppStore((s) => s.setDbFields)
  const tryConnectDb = useAppStore((s) => s.tryConnectDb)
  const disconnectDb = useAppStore((s) => s.disconnectDb)
  const parties = useAppStore((s) => s.parties)
  const invoices = useAppStore((s) => s.invoices)
  const ledger = useAppStore((s) => s.ledger)

  const localHasData =
    parties.length > 0 || invoices.length > 0 || ledger.length > 0

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-[var(--modi-red-soft)] p-3 text-[var(--modi-red)]">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Office database</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Connect to the MODI API on your server PC (Postgres on that machine’s
              disk). Same Wi‑Fi / TSplus LAN. Fill in the address when ready.
            </p>
          </div>
        </div>

        <div
          className={`mb-3 flex items-center gap-3 rounded-2xl px-4 py-3 ${
            dbConnected
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          {dbConnected ? (
            <Cloud className="h-5 w-5 shrink-0" />
          ) : (
            <CloudOff className="h-5 w-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {dbConnected
                ? 'Connected — Postgres on office PC'
                : 'Not connected'}
            </p>
            <p className="text-xs opacity-80">
              {dbConnected
                ? `Live sync: ${liveSyncStatus} · revision ${dbRevision}. Closing the app does not delete data.`
                : 'Connect before saving invoices so nothing is lost if TSplus closes.'}
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sky-900">
          <Wifi className="h-5 w-5 shrink-0" />
          <p className="text-xs">
            Server PC must be on the same Wi‑Fi, with the MODI office API running
            (port 8787) and firewall allowing that port.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-600">
              Office API URL
            </span>
            <input
              value={dbUrl}
              onChange={(e) => setDbFields(e.target.value, dbKey)}
              placeholder="http://192.168.1.50:8787"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-600">API token</span>
            <input
              type="password"
              value={dbKey}
              onChange={(e) => setDbFields(dbUrl, e.target.value)}
              placeholder="Same as MODI_API_TOKEN on the server"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
            />
          </label>
        </div>

        {dbMessage && (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              dbConnected
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {dbMessage}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={dbConnecting}
            onClick={() => void tryConnectDb({ pushLocalIfEmpty: false })}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--modi-red)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--modi-red-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dbConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
            {dbConnecting ? 'Connecting…' : 'Connect'}
          </button>
          {localHasData && (
            <button
              type="button"
              disabled={dbConnecting}
              onClick={() => void tryConnectDb({ pushLocalIfEmpty: true })}
              className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              title="If the server database is empty, upload this PC’s cached data once"
            >
              Connect + upload local cache
            </button>
          )}
          <button
            type="button"
            onClick={disconnectDb}
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-[var(--modi-red)]" />
          <div>
            <p className="font-semibold">Security & durability</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-600">
              <li>Postgres runs only on the server PC (localhost) — not open on Wi‑Fi</li>
              <li>LAN clients talk to the API with a shared secret token</li>
              <li>Every save is committed to disk before the UI confirms</li>
              <li>Live WebSocket pushes updates to all open TSplus sessions</li>
              <li>
                Setup steps: see{' '}
                <code className="rounded bg-zinc-100 px-1 text-xs">
                  server/README.md
                </code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
