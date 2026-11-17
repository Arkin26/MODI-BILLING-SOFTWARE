import { useAppStore } from '../../store/useStore'
import { relativeDueLabel } from '../../lib/dates'
import clsx from 'clsx'

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const notifications = useAppStore((s) => s.notifications)
  const markNotificationRead = useAppStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead)
  const openParty = useAppStore((s) => s.openParty)
  const invoices = useAppStore((s) => s.invoices)

  return (
    <div className="absolute top-12 right-0 z-50 w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <p className="font-display text-sm font-semibold">Notifications</p>
          <p className="text-[11px] text-zinc-500">Invoice deadlines by party</p>
        </div>
        <button
          type="button"
          onClick={markAllNotificationsRead}
          className="text-xs font-medium text-[var(--modi-red)] hover:underline"
        >
          Mark all read
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {notifications.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-zinc-500">
            No reminders right now.
          </li>
        )}
        {notifications.map((n) => {
          const inv = invoices.find((i) => i.id === n.invoiceId)
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  markNotificationRead(n.id)
                  openParty(n.partyId)
                  onClose()
                }}
                className={clsx(
                  'flex w-full flex-col gap-1 border-b border-zinc-50 px-4 py-3 text-left hover:bg-zinc-50',
                  !n.read && 'bg-[var(--modi-red-soft)]/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      n.type === 'overdue' && 'bg-red-100 text-red-700',
                      n.type === 'due_today' && 'bg-amber-100 text-amber-800',
                      n.type === 'due_soon' && 'bg-sky-100 text-sky-700',
                    )}
                  >
                    {n.type.replace('_', ' ')}
                  </span>
                  {!n.read && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--modi-red)]" />
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-800">{n.message}</p>
                {inv && (
                  <p className="text-[11px] text-zinc-500">
                    {relativeDueLabel(inv.dueDate)}
                  </p>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
