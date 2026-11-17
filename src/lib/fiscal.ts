import { format, parseISO, startOfDay } from 'date-fns'
import type { Invoice, LedgerEntry } from '../types'
import { partyBalance } from './dates'

/** Indian financial year: 1 Apr → 31 Mar. `startYear` is the April year (e.g. 2025 → FY 2025-26). */
export function fiscalYearStartYear(date: Date | string = new Date()): number {
  const d = typeof date === 'string' ? startOfDay(parseISO(date)) : startOfDay(date)
  const month = d.getMonth() // 0-based
  const year = d.getFullYear()
  return month >= 3 ? year : year - 1
}

export function fiscalYearRange(startYear: number): { from: string; to: string } {
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  }
}

export function fiscalYearLabel(startYear: number): string {
  const end = String(startYear + 1).slice(-2)
  return `${startYear}-${end}`
}

export function listRelevantFiscalYears(
  invoices: Invoice[],
  ledger: LedgerEntry[],
  extraDate: Date | string = new Date(),
): number[] {
  const years = new Set<number>()
  years.add(fiscalYearStartYear(extraDate))
  for (const inv of invoices) {
    years.add(fiscalYearStartYear(inv.invoiceDate))
  }
  for (const e of ledger) {
    years.add(fiscalYearStartYear(e.date))
  }
  return [...years].sort((a, b) => b - a)
}

/** Balance of entries strictly before `from` (closing of prior period). */
export function openingBalanceBefore(
  entries: LedgerEntry[],
  from: string,
): number {
  return partyBalance(entries.filter((e) => e.date < from))
}

export function filterInvoicesByPeriod(
  invoices: Invoice[],
  from: string | null,
  to: string | null,
): Invoice[] {
  return invoices.filter((inv) => {
    if (from && inv.invoiceDate < from) return false
    if (to && inv.invoiceDate > to) return false
    return true
  })
}

export function filterLedgerByPeriod(
  entries: LedgerEntry[],
  from: string | null,
  to: string | null,
): LedgerEntry[] {
  return entries.filter((e) => {
    if (from && e.date < from) return false
    if (to && e.date > to) return false
    return true
  })
}

/**
 * Ledger rows for a period: opening = prior closing (Apr–Mar carry-forward),
 * then in-range activity. Opening is always recomputed from:
 * - every entry strictly before `from` (so out-of-FY payments clear brought-forward),
 * - plus any stored `opening` rows on `from` (seed / starting snapshot).
 * Stored openings on `from` are replaced by one synthetic line so they are not
 * double-counted in the running balance.
 */
export function ledgerForPeriod(
  entries: LedgerEntry[],
  from: string | null,
  to: string | null,
  partyId?: string,
): LedgerEntry[] {
  const inRange = filterLedgerByPeriod(entries, from, to)
  if (!from) return inRange

  const storedOpeningsOnFrom = inRange.filter(
    (e) => e.type === 'opening' && e.date === from,
  )
  const activity = inRange.filter(
    (e) => !(e.type === 'opening' && e.date === from),
  )

  const priorBal =
    openingBalanceBefore(entries, from) + partyBalance(storedOpeningsOnFrom)

  if (priorBal === 0) return activity

  const synthetic: LedgerEntry = {
    id: `opening-synth-${from}`,
    partyId: partyId ?? entries[0]?.partyId ?? '',
    date: from,
    type: 'opening',
    particular: 'Opening Balance (brought forward)',
    debit: priorBal > 0 ? priorBal : 0,
    credit: priorBal < 0 ? Math.abs(priorBal) : 0,
  }
  return [synthetic, ...activity]
}

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
