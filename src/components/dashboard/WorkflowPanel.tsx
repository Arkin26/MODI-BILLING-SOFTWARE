import { Check, UserCheck, X } from 'lucide-react'
import { useAppStore } from '../../store/useStore'
import { useCurrentUser } from '../../hooks/useAppData'
import { formatCurrency, formatDisplayDate } from '../../lib/dates'

/** Admin: approve scanned bills + confirm payments; assign collection tasks. */
export function WorkflowPanel() {
  const user = useCurrentUser()
  const invoices = useAppStore((s) => s.invoices)
  const parties = useAppStore((s) => s.parties)
  const users = useAppStore((s) => s.users)
  const openParty = useAppStore((s) => s.openParty)
  const approvePendingInvoice = useAppStore((s) => s.approvePendingInvoice)
  const rejectPendingInvoice = useAppStore((s) => s.rejectPendingInvoice)
  const assignCollectionTask = useAppStore((s) => s.assignCollectionTask)
  const confirmInvoicePaid = useAppStore((s) => s.confirmInvoicePaid)
  const markCollectionDone = useAppStore((s) => s.markCollectionDone)

  if (!user) return null

  const pendingApproval = invoices.filter((i) => i.status === 'pending_approval')
  const awaitingPaid = invoices.filter(
    (i) => i.status === 'awaiting_payment_confirm',
  )
  const myTasks = invoices.filter(
    (i) =>
      i.status === 'in_progress' &&
      i.collectionAssignedTo === user.id,
  )
  const staff = users.filter((u) => u.role === 'user' || u.role === 'admin')

  function partyName(partyId: string) {
    return parties.find((p) => p.id === partyId)?.name ?? partyId
  }

  function submitterName(id?: string | null) {
    if (!id) return '—'
    return users.find((u) => u.id === id)?.name ?? id
  }

  if (user.role !== 'admin' && myTasks.length === 0) return null

  return (
    <div className="space-y-4">
      {user.role === 'admin' && pendingApproval.length > 0 && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <h3 className="font-display text-base font-semibold text-violet-900">
            Bills awaiting your approval ({pendingApproval.length})
          </h3>
          <p className="mt-1 text-xs text-violet-800/80">
            Staff scanned these. Approve to post to the party ledger, or reject.
          </p>
          <ul className="mt-3 divide-y divide-violet-100">
            {pendingApproval.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => openParty(inv.partyId)}
                >
                  <p className="font-semibold text-zinc-900">
                    {inv.billNo ?? inv.id} · {partyName(inv.partyId)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatCurrency(inv.amount)} ·{' '}
                    {formatDisplayDate(inv.invoiceDate)} · by{' '}
                    {submitterName(inv.submittedBy)}
                  </p>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void approvePendingInvoice(inv.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectPendingInvoice(inv.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user.role === 'admin' && awaitingPaid.length > 0 && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
          <h3 className="font-display text-base font-semibold text-orange-950">
            Confirm payments ({awaitingPaid.length})
          </h3>
          <p className="mt-1 text-xs text-orange-900/80">
            Staff finished collection. Confirm to mark paid and update ledger.
          </p>
          <ul className="mt-3 divide-y divide-orange-100">
            {awaitingPaid.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-semibold">
                    {inv.billNo ?? inv.id} · {partyName(inv.partyId)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatCurrency(inv.amount)} · collector{' '}
                    {submitterName(inv.collectionAssignedTo)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void confirmInvoicePaid(inv.id)}
                  className="rounded-full bg-[var(--modi-red)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Mark paid
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user.role === 'admin' && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h3 className="font-display text-base font-semibold">
            Assign collection tasks
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Give pending (open) invoices to a staff member to collect.
          </p>
          <ul className="mt-3 divide-y divide-zinc-100">
            {invoices
              .filter((i) => i.status === 'open' || i.status === 'in_progress')
              .slice(0, 20)
              .map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {inv.billNo ?? inv.id} · {partyName(inv.partyId)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatCurrency(inv.amount)} · due{' '}
                      {formatDisplayDate(inv.dueDate)}
                      {inv.collectionAssignedTo
                        ? ` · assigned ${submitterName(inv.collectionAssignedTo)}`
                        : ''}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <UserCheck className="h-3.5 w-3.5 text-zinc-400" />
                    <select
                      className="rounded-lg border border-zinc-200 px-2 py-1.5"
                      value={inv.collectionAssignedTo ?? ''}
                      onChange={(e) => {
                        const uid = e.target.value
                        if (uid) void assignCollectionTask(inv.id, uid)
                      }}
                    >
                      <option value="">Assign to…</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            {invoices.filter((i) => i.status === 'open' || i.status === 'in_progress')
              .length === 0 && (
              <li className="py-4 text-center text-sm text-zinc-500">
                No open invoices to assign.
              </li>
            )}
          </ul>
        </section>
      )}

      {myTasks.length > 0 && (
        <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
          <h3 className="font-display text-base font-semibold text-sky-950">
            My collection tasks ({myTasks.length})
          </h3>
          <p className="mt-1 text-xs text-sky-900/80">
            When you finish collecting, send it to admin to mark paid.
          </p>
          <ul className="mt-3 divide-y divide-sky-100">
            {myTasks.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() => openParty(inv.partyId)}
                >
                  <p className="font-semibold">
                    {inv.billNo ?? inv.id} · {partyName(inv.partyId)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatCurrency(inv.amount)} · due{' '}
                    {formatDisplayDate(inv.dueDate)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void markCollectionDone(inv.id)}
                  className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Collection done
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
