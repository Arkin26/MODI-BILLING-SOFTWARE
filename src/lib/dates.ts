import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { Invoice, InvoiceStatus, LedgerEntry, Party } from '../types'

export function parseDueDate(dueDate: string): Date {
  return startOfDay(parseISO(dueDate))
}

export function daysUntilDue(dueDate: string, from = new Date()): number {
  return differenceInCalendarDays(parseDueDate(dueDate), startOfDay(from))
}

export function isOverdue(invoice: Invoice, from = new Date()): boolean {
  if (
    invoice.status === 'paid' ||
    invoice.status === 'pending_approval' ||
    invoice.status === 'awaiting_payment_confirm'
  ) {
    return false
  }
  return daysUntilDue(invoice.dueDate, from) < 0
}

export function isDueSoon(invoice: Invoice, from = new Date()): boolean {
  if (
    invoice.status === 'paid' ||
    invoice.status === 'pending_approval' ||
    invoice.status === 'awaiting_payment_confirm'
  ) {
    return false
  }
  const days = daysUntilDue(invoice.dueDate, from)
  return days >= 0 && days <= 7
}

export function sortByClosestDueDate(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort((a, b) => {
    const aPaid = a.status === 'paid' ? 1 : 0
    const bPaid = b.status === 'paid' ? 1 : 0
    if (aPaid !== bPaid) return aPaid - bPaid
    return parseDueDate(a.dueDate).getTime() - parseDueDate(b.dueDate).getTime()
  })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Line-item nett rate / amounts (keep paise). */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDisplayDate(dueDate: string): string {
  const d = parseDueDate(dueDate)
  if (!isValid(d)) return dueDate
  return format(d, 'dd MMM yyyy')
}

export function displayStatus(invoice: Invoice): InvoiceStatus | 'overdue' {
  if (invoice.status === 'paid') return 'paid'
  if (isOverdue(invoice)) return 'overdue'
  return invoice.status
}

export function relativeDueLabel(dueDate: string): string {
  const days = daysUntilDue(dueDate)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

export function addDaysIso(base: string, days: number): string {
  return format(addDays(parseDueDate(base), days), 'yyyy-MM-dd')
}

/** Running ledger balance (positive = party owes / Dr). */
export function partyBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.debit - e.credit, 0)
}

export function ledgerWithRunningBalance(entries: LedgerEntry[]): Array<
  LedgerEntry & { balance: number }
> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  let bal = 0
  return sorted.map((e) => {
    bal += e.debit - e.credit
    return { ...e, balance: bal }
  })
}

export function isOverCreditLimit(party: Party, balance: number): boolean {
  return balance > party.creditLimit
}
