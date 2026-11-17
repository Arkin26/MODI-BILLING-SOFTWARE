import { format, startOfDay } from 'date-fns'
import type {
  AppNotification,
  Invoice,
  NotificationType,
  Party,
} from '../types'
import { daysUntilDue } from './dates'

function messageFor(
  type: NotificationType,
  invoice: Invoice,
  partyName: string,
): string {
  switch (type) {
    case 'due_soon':
      return `${partyName} invoice ${invoice.billNo ?? invoice.id} due in 7 days (₹${invoice.amount.toLocaleString('en-IN')})`
    case 'due_today':
      return `${partyName} invoice ${invoice.billNo ?? invoice.id} is due today`
    case 'overdue': {
      const late = Math.abs(daysUntilDue(invoice.dueDate))
      return `${partyName} invoice ${invoice.billNo ?? invoice.id} is ${late} day${late === 1 ? '' : 's'} overdue`
    }
  }
}

function shouldFire(
  type: NotificationType,
  invoice: Invoice,
  today: Date,
): boolean {
  if (invoice.status === 'paid') return false
  if (invoice.status === 'pending_approval') return false
  if (invoice.status === 'awaiting_payment_confirm') return false
  const days = daysUntilDue(invoice.dueDate, today)
  if (type === 'due_soon') return days === 7
  if (type === 'due_today') return days === 0
  if (type === 'overdue') return days < 0 && Math.abs(days) % 7 === 0
  return false
}

export function ensureDemoNotifications(
  invoices: Invoice[],
  parties: Party[],
  userId: string,
  isAdmin: boolean,
  existing: AppNotification[],
  today = new Date(),
): AppNotification[] {
  const partyMap = new Map(parties.map((p) => [p.id, p]))
  const visible = invoices.filter((inv) => {
    if (isAdmin) return true
    const party = partyMap.get(inv.partyId)
    return party?.assignedTo === userId
  })

  const todayKey = format(startOfDay(today), 'yyyy-MM-dd')
  let list = existing.filter((n) => n.userId === userId)
  const types: NotificationType[] = ['due_soon', 'due_today', 'overdue']

  for (const invoice of visible) {
    const party = partyMap.get(invoice.partyId)
    const partyName = party?.name ?? 'Party'
    for (const type of types) {
      if (!shouldFire(type, invoice, today)) continue
      const id = `${invoice.id}-${type}-${todayKey}-${userId}`
      if (list.some((n) => n.id === id)) continue
      list = [
        ...list,
        {
          id,
          invoiceId: invoice.id,
          partyId: invoice.partyId,
          userId,
          type,
          forDate: todayKey,
          message: messageFor(type, invoice, partyName),
          read: false,
        },
      ]
    }

    if (invoice.status === 'paid') continue
    const days = daysUntilDue(invoice.dueDate, today)
    let type: NotificationType | null = null
    if (days < 0) type = 'overdue'
    else if (days === 0) type = 'due_today'
    else if (days > 0 && days <= 7) type = 'due_soon'
    if (!type) continue
    const id = `ctx-${invoice.id}-${type}-${userId}`
    if (
      list.some(
        (n) =>
          n.id === id ||
          (n.invoiceId === invoice.id && n.type === type && n.userId === userId),
      )
    ) {
      continue
    }
    list = [
      ...list,
      {
        id,
        invoiceId: invoice.id,
        partyId: invoice.partyId,
        userId,
        type,
        forDate: todayKey,
        message: messageFor(type, invoice, partyName),
        read: false,
      },
    ]
  }

  return list
}
