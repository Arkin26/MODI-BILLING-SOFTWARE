import clsx from 'clsx'
import type { Invoice } from '../../types'
import { displayStatus } from '../../lib/dates'

const STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  open: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  overdue: 'bg-red-50 text-red-700 ring-red-200',
  pending_approval: 'bg-violet-50 text-violet-700 ring-violet-200',
  awaiting_payment_confirm: 'bg-orange-50 text-orange-800 ring-orange-200',
}

const LABELS: Record<string, string> = {
  paid: 'Paid',
  open: 'Pending',
  in_progress: 'Collection task',
  overdue: 'Overdue',
  pending_approval: 'Awaiting admin',
  awaiting_payment_confirm: 'Confirm payment',
}

export function StatusBadge({ invoice }: { invoice: Invoice }) {
  const status = displayStatus(invoice)
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        STYLES[status] ?? STYLES.open,
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
