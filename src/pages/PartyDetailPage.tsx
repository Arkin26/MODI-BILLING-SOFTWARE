import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, AlertTriangle, Camera, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useAppStore } from '../store/useStore'
import { useCurrentUser } from '../hooks/useAppData'
import {
  formatCurrency,
  formatDisplayDate,
  formatMoney,
  isOverCreditLimit,
  ledgerWithRunningBalance,
  partyBalance,
  relativeDueLabel,
  sortByClosestDueDate,
} from '../lib/dates'
import {
  filterInvoicesByPeriod,
  fiscalYearLabel,
  fiscalYearRange,
  fiscalYearStartYear,
  ledgerForPeriod,
  listRelevantFiscalYears,
} from '../lib/fiscal'
import { StatusBadge } from '../components/invoices/StatusBadge'
import { PartyFilesPanel } from '../components/parties/PartyFilesPanel'
import type { Invoice } from '../types'

const LINE_PREVIEW = 3

type PeriodMode = 'fy' | 'custom' | 'all'

export function PartyDetailPage() {
  const partyId = useAppStore((s) => s.selectedPartyId)
  const parties = useAppStore((s) => s.parties)
  const allInvoices = useAppStore((s) => s.invoices)
  const allLedger = useAppStore((s) => s.ledger)
  const party = useMemo(
    () => parties.find((p) => p.id === partyId),
    [parties, partyId],
  )
  const invoices = useMemo(
    () => allInvoices.filter((i) => i.partyId === partyId),
    [allInvoices, partyId],
  )
  const ledger = useMemo(
    () => allLedger.filter((e) => e.partyId === partyId),
    [allLedger, partyId],
  )
  const setPage = useAppStore((s) => s.setPage)
  const setPartyCreditLimit = useAppStore((s) => s.setPartyCreditLimit)
  const setPartyPhoto = useAppStore((s) => s.setPartyPhoto)
  const setInvoiceDueDate = useAppStore((s) => s.setInvoiceDueDate)
  const updateInvoiceStatus = useAppStore((s) => s.updateInvoiceStatus)
  const addPayment = useAppStore((s) => s.addPayment)
  const currentUser = useCurrentUser()
  const balance = useMemo(() => partyBalance(ledger), [ledger])

  const [tab, setTab] = useState<'invoices' | 'ledger' | 'photos'>('invoices')
  const [limitDraft, setLimitDraft] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('CASH')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [expanded, setExpanded] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const fyOptions = useMemo(
    () => listRelevantFiscalYears(invoices, ledger),
    [invoices, ledger],
  )
  const currentFy = fiscalYearStartYear()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('fy')
  const [fyYear, setFyYear] = useState(currentFy)
  /** When false, selection follows the live current FY as the calendar rolls. */
  const [fyFollowCurrent, setFyFollowCurrent] = useState(true)
  const [customFrom, setCustomFrom] = useState(() => fiscalYearRange(currentFy).from)
  const [customTo, setCustomTo] = useState(() => fiscalYearRange(currentFy).to)

  // Reset to the live FY whenever the party changes.
  useEffect(() => {
    const live = fiscalYearStartYear()
    const range = fiscalYearRange(live)
    setPeriodMode('fy')
    setFyYear(live)
    setFyFollowCurrent(true)
    setCustomFrom(range.from)
    setCustomTo(range.to)
  }, [partyId])

  // Auto-advance FY dates when a new financial year begins (Apr 1).
  useEffect(() => {
    if (!fyFollowCurrent) return
    if (fyYear === currentFy) return
    const range = fiscalYearRange(currentFy)
    setFyYear(currentFy)
    setCustomFrom(range.from)
    setCustomTo(range.to)
  }, [currentFy, fyFollowCurrent, fyYear])

  useEffect(() => {
    if (fyOptions.length && !fyOptions.includes(fyYear)) {
      const next = fyOptions.includes(currentFy)
        ? currentFy
        : (fyOptions[0] ?? currentFy)
      setFyYear(next)
      setFyFollowCurrent(next === currentFy)
    }
  }, [fyOptions, fyYear, currentFy])

  function selectFyYear(year: number) {
    setFyYear(year)
    setFyFollowCurrent(year === currentFy)
    const range = fiscalYearRange(year)
    setCustomFrom(range.from)
    setCustomTo(range.to)
  }

  const { from, to } = useMemo(() => {
    if (periodMode === 'all') return { from: null as string | null, to: null as string | null }
    if (periodMode === 'custom') return { from: customFrom || null, to: customTo || null }
    return fiscalYearRange(fyYear)
  }, [periodMode, fyYear, customFrom, customTo])

  const filteredInvoices = useMemo(
    () => sortByClosestDueDate(filterInvoicesByPeriod(invoices, from, to)),
    [invoices, from, to],
  )
  const periodLedger = useMemo(
    () => ledgerForPeriod(ledger, from, to, partyId ?? undefined),
    [ledger, from, to, partyId],
  )
  const ledgerRows = useMemo(
    () => ledgerWithRunningBalance(periodLedger),
    [periodLedger],
  )
  const periodBalance = useMemo(
    () => partyBalance(periodLedger),
    [periodLedger],
  )

  if (!party || !partyId) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-zinc-500">Select a party from the list.</p>
        <button
          type="button"
          onClick={() => setPage('parties')}
          className="mt-4 text-sm font-semibold text-[var(--modi-red)]"
        >
          Back to parties
        </button>
      </div>
    )
  }

  const over = isOverCreditLimit(party, balance)
  const isAdmin = currentUser?.role === 'admin'

  function onPhotoSelected(file: File | null) {
    if (!file || !party) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (result) void setPartyPhoto(party.id, result).catch((err) => {
        alert(err instanceof Error ? err.message : 'Failed to save photo')
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setPage('parties')}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> All parties
      </button>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="relative shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                {party.photo ? (
                  <img
                    src={party.photo}
                    alt={party.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-400">
                    {party.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onPhotoSelected(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Camera className="h-3 w-3" />
                  {party.photo ? 'Change' : 'Photo'}
                </button>
                {party.photo && (
                  <button
                    type="button"
                    onClick={() =>
                      void setPartyPhoto(party.id, null).catch((err) => {
                        alert(
                          err instanceof Error
                            ? err.message
                            : 'Failed to remove photo',
                        )
                      })
                    }
                    className="inline-flex items-center rounded-full border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-50"
                    title="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-[var(--modi-red)] uppercase">
                Party account
              </p>
              <h2 className="font-display mt-1 text-2xl font-bold">{party.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {[party.address, party.gstin, party.phone].filter(Boolean).join(' · ') ||
                  'No extra details'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Balance owed</p>
              <p
                className={`font-display text-xl font-bold ${
                  balance > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(Math.abs(balance))}
                {balance > 0 ? ' Dr' : balance < 0 ? ' Cr' : ''}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Credit limit</p>
              <p className="font-display text-xl font-bold">
                {formatCurrency(party.creditLimit)}
              </p>
            </div>
          </div>
        </div>

        {over && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Balance exceeds credit limit by{' '}
            {formatCurrency(balance - party.creditLimit)}. You can still save
            invoices; raise the limit if needed.
          </div>
        )}

        {isAdmin && (
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">
                Update credit limit (₹)
              </span>
              <input
                type="number"
                value={limitDraft || String(party.creditLimit)}
                onChange={(e) => setLimitDraft(e.target.value)}
                className="w-40 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const n = Number(limitDraft || party.creditLimit)
                  if (Number.isFinite(n) && n >= 0) {
                    try {
                      await setPartyCreditLimit(party.id, n)
                      setLimitDraft('')
                    } catch (err) {
                      alert(
                        err instanceof Error
                          ? err.message
                          : 'Failed to save credit limit',
                      )
                    }
                  }
                })()
              }}
              className="rounded-full bg-[var(--modi-red)] px-4 py-2 text-sm font-semibold text-white"
            >
              Save limit
            </button>
          </div>
        )}
      </div>

      <PeriodFilter
        mode={periodMode}
        onMode={setPeriodMode}
        fyYear={fyYear}
        fyOptions={fyOptions.length ? fyOptions : [currentFy]}
        onFyYear={selectFyYear}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        periodBalance={periodMode === 'all' ? balance : periodBalance}
        invoiceCount={filteredInvoices.length}
        ledgerCount={periodLedger.length}
      />

      <div className="flex gap-1 border-b border-zinc-200">
        {(['invoices', 'ledger', 'photos'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2.5 text-sm capitalize ${
              tab === t
                ? 'border-[var(--modi-red)] font-semibold text-[var(--modi-red)]'
                : 'border-transparent text-zinc-500'
            }`}
          >
            {t === 'photos' ? 'Photos / PDFs' : t}
          </button>
        ))}
      </div>

      {tab === 'photos' && <PartyFilesPanel party={party} />}

      {tab === 'invoices' && (
        <div className="space-y-3">
          {filteredInvoices.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-zinc-500">
              No invoices in this period.
            </p>
          )}
          {filteredInvoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              expanded={expanded === inv.id}
              onToggle={() =>
                setExpanded((id) => (id === inv.id ? null : inv.id))
              }
              onDueDate={(d) =>
                void setInvoiceDueDate(inv.id, d).catch((err) =>
                  alert(
                    err instanceof Error ? err.message : 'Failed to update date',
                  ),
                )
              }
              onStatus={(s) =>
                void updateInvoiceStatus(inv.id, s).catch((err) =>
                  alert(
                    err instanceof Error
                      ? err.message
                      : 'Failed to update status',
                  ),
                )
              }
              canEdit={isAdmin || currentUser?.role === 'user'}
            />
          ))}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Record payment received</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-32 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Particular (CASH / UPI…)"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="min-w-[160px] flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const n = Number(payAmount)
                    if (!Number.isFinite(n) || n <= 0) return
                    try {
                      await addPayment(party.id, n, payNote, payDate)
                      setPayAmount('')
                      // Show the FY that contains this payment so it clears
                      // outstanding in the period view instead of disappearing.
                      const payFy = fiscalYearStartYear(payDate)
                      setPeriodMode('fy')
                      selectFyYear(payFy)
                    } catch (err) {
                      alert(
                        err instanceof Error
                          ? err.message
                          : 'Failed to save payment',
                      )
                    }
                  })()
                }}
                className="rounded-full bg-[var(--modi-red)] px-4 py-2 text-sm font-semibold text-white"
              >
                Add payment
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Vch</th>
                  <th className="px-3 py-3">Particular</th>
                  <th className="px-3 py-3 text-right">Debit</th>
                  <th className="px-3 py-3 text-right">Credit</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-zinc-500"
                    >
                      No ledger entries in this period.
                    </td>
                  </tr>
                )}
                {ledgerRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-zinc-100 ${
                      row.type === 'opening' ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {formatDisplayDate(row.date)}
                    </td>
                    <td className="px-3 py-2.5 capitalize">{row.type}</td>
                    <td className="px-3 py-2.5 text-zinc-500">
                      {row.voucherNo ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">{row.particular}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.debit ? formatCurrency(row.debit) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.credit ? formatCurrency(row.credit) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {formatCurrency(Math.abs(row.balance))}
                      {row.balance >= 0 ? ' Dr' : ' Cr'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function PeriodFilter({
  mode,
  onMode,
  fyYear,
  fyOptions,
  onFyYear,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  periodBalance,
  invoiceCount,
  ledgerCount,
}: {
  mode: PeriodMode
  onMode: (m: PeriodMode) => void
  fyYear: number
  fyOptions: number[]
  onFyYear: (y: number) => void
  customFrom: string
  customTo: string
  onCustomFrom: (v: string) => void
  onCustomTo: (v: string) => void
  periodBalance: number
  invoiceCount: number
  ledgerCount: number
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Period filter</p>
          <p className="text-xs text-zinc-500">
            FY runs April → March · prior closing becomes next opening · advances
            automatically each April
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'} · {ledgerCount}{' '}
          ledger · period{' '}
          <span
            className={
              periodBalance > 0
                ? 'font-semibold text-red-700'
                : 'font-semibold text-emerald-700'
            }
          >
            {formatCurrency(Math.abs(periodBalance))}
            {periodBalance > 0 ? ' Dr' : periodBalance < 0 ? ' Cr' : ''}
          </span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ['fy', 'Financial year'],
            ['custom', 'Custom dates'],
            ['all', 'All time'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onMode(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              mode === value
                ? 'bg-[var(--modi-red)] text-white'
                : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'fy' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500">FY</label>
          <select
            value={fyYear}
            onChange={(e) => onFyYear(Number(e.target.value))}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[var(--modi-red)]"
          >
            {fyOptions.map((y) => {
              const range = fiscalYearRange(y)
              return (
                <option key={y} value={y}>
                  {fiscalYearLabel(y)} ({formatDisplayDate(range.from)} –{' '}
                  {formatDisplayDate(range.to)})
                </option>
              )
            })}
          </select>
        </div>
      )}

      {mode === 'custom' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-500">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-500">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomTo(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  )
}

function InvoiceCard({
  invoice,
  expanded,
  onToggle,
  onDueDate,
  onStatus,
  canEdit,
}: {
  invoice: Invoice
  expanded: boolean
  onToggle: () => void
  onDueDate: (d: string) => void
  onStatus: (s: Invoice['status']) => void
  canEdit: boolean
}) {
  const [showAllItems, setShowAllItems] = useState(false)
  const items = invoice.lineItems
  const hasMore = items.length > LINE_PREVIEW
  const visible = showAllItems ? items : items.slice(0, LINE_PREVIEW)

  useEffect(() => {
    if (!expanded) setShowAllItems(false)
  }, [expanded])

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="font-semibold">
            {invoice.billNo ?? invoice.id}
            <span className="ml-2 text-xs font-normal text-zinc-400">
              billed {formatDisplayDate(invoice.invoiceDate)}
            </span>
          </p>
          <p className="text-xs text-zinc-500">
            Deadline {formatDisplayDate(invoice.dueDate)} ·{' '}
            {relativeDueLabel(invoice.dueDate)}
            {items.length > 0 && (
              <>
                {' '}
                · {items.length} item{items.length === 1 ? '' : 's'}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display font-bold">
            {formatCurrency(invoice.amount)}
          </span>
          <StatusBadge invoice={invoice} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-100 px-4 py-4">
          {canEdit && (
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-500">
                  Payment deadline
                </span>
                <input
                  type="date"
                  value={invoice.dueDate}
                  onChange={(e) => onDueDate(e.target.value)}
                  className="rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-500">Status</span>
                <select
                  value={invoice.status}
                  onChange={(e) =>
                    onStatus(e.target.value as Invoice['status'])
                  }
                  className="rounded-xl border border-zinc-200 px-3 py-2"
                >
                  <option value="open">Pending</option>
                  <option value="in_progress">Collection task</option>
                  <option value="awaiting_payment_confirm">
                    Awaiting payment confirm
                  </option>
                  <option value="pending_approval">Awaiting admin</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">HSN</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 text-right">Nett rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((li) => (
                  <tr key={li.id} className="border-t border-zinc-50">
                    <td className="px-3 py-2 font-medium">{li.description}</td>
                    <td className="px-3 py-2 text-zinc-500">{li.hsn ?? '—'}</td>
                    <td className="px-3 py-2">
                      {li.qty} {li.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(li.rate)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatMoney(li.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50">
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right font-semibold"
                  >
                    Invoice total
                  </td>
                  <td className="px-3 py-2 text-right font-bold">
                    {formatMoney(invoice.amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAllItems((v) => !v)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--modi-red)] hover:underline"
            >
              {showAllItems ? (
                <>
                  Show less <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  Show more ({items.length - LINE_PREVIEW} more)
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </button>
          )}

          {invoice.pdfName && (
            <p className="text-xs text-zinc-500">Source PDF: {invoice.pdfName}</p>
          )}
        </div>
      )}
    </div>
  )
}
