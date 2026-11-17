import { useMemo } from 'react'
import { useAppStore } from '../../store/useStore'
import { useCurrentUser, useVisibleInvoices } from '../../hooks/useAppData'
import { isDueSoon, isOverdue } from '../../lib/dates'

export function AlertBanner() {
  const invoices = useVisibleInvoices()
  const setPage = useAppStore((s) => s.setPage)
  const user = useCurrentUser()

  const { dueSoon, overdue } = useMemo(() => {
    return {
      dueSoon: invoices.filter((i) => isDueSoon(i)).length,
      overdue: invoices.filter((i) => isOverdue(i)).length,
    }
  }, [invoices])

  if (dueSoon === 0 && overdue === 0) {
    return (
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#e11d2e] to-[#9f1239] p-5 text-white shadow-sm">
        <p className="font-display text-lg font-semibold">
          All clear for {user?.name ?? 'you'}
        </p>
        <p className="mt-1 max-w-xl text-sm text-white/85">
          No party invoices due in the next 7 days. Open a party to review
          ledger and credit limits.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#e11d2e] to-[#9f1239] p-5 text-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-white/70 uppercase">
            Reminder center
          </p>
          <p className="font-display mt-1 text-xl font-bold">
            {[
              dueSoon > 0
                ? `${dueSoon} invoice${dueSoon === 1 ? '' : 's'} due within 7 days`
                : null,
              overdue > 0 ? `${overdue} overdue` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-white/85">
            Deadlines are set per invoice under each party. Closest due dates
            stay at the top.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPage('parties')}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--modi-red)] hover:bg-zinc-50"
        >
          View parties
        </button>
      </div>
    </div>
  )
}
