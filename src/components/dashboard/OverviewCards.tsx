import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from 'date-fns'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Clock3,
} from 'lucide-react'
import {
  useVisibleInvoices,
  useVisibleParties,
} from '../../hooks/useAppData'
import { useAppStore } from '../../store/useStore'
import { formatCurrency, isOverdue, partyBalance } from '../../lib/dates'

export function OverviewCards() {
  const invoices = useVisibleInvoices()
  const parties = useVisibleParties()
  const ledger = useAppStore((s) => s.ledger)
  const today = startOfDay(new Date())

  const totalOwed = parties.reduce((sum, p) => {
    const bal = partyBalance(ledger.filter((e) => e.partyId === p.id))
    return sum + Math.max(0, bal)
  }, 0)

  const overdueCount = invoices.filter((i) => isOverdue(i)).length
  const dueSoon = invoices.filter((i) => {
    if (i.status === 'paid') return false
    const days = differenceInCalendarDays(parseISO(i.dueDate), today)
    return days >= 0 && days <= 7
  }).length

  const cards = [
    {
      label: 'Parties',
      value: String(parties.length),
      hint: 'Active accounts',
      icon: Building2,
      tone: 'text-[var(--modi-red)] bg-[var(--modi-red-soft)]',
    },
    {
      label: 'Total outstanding',
      value: formatCurrency(totalOwed),
      hint: 'Sum of party Dr balances',
      icon: CircleDollarSign,
      tone: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Overdue invoices',
      value: String(overdueCount),
      hint: 'Need follow-up',
      icon: AlertTriangle,
      tone: 'text-red-600 bg-red-50',
    },
    {
      label: 'Due within 7 days',
      value: String(dueSoon),
      hint: format(today, 'dd MMM yyyy'),
      icon: Clock3,
      tone: 'text-sky-600 bg-sky-50',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-500">{card.label}</p>
                <p className="font-display mt-2 text-2xl font-bold tracking-tight">
                  {card.value}
                </p>
              </div>
              <div className={`rounded-xl p-2.5 ${card.tone}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-zinc-500">
              <ArrowUpRight className="h-3.5 w-3.5 text-[var(--modi-red)]" />
              {card.hint}
            </p>
          </div>
        )
      })}
    </div>
  )
}
