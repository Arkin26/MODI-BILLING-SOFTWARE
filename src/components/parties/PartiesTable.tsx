import { useMemo } from 'react'
import { useAppStore } from '../../store/useStore'
import {
  useCurrentUser,
  useVisibleParties,
} from '../../hooks/useAppData'
import {
  formatCurrency,
  isOverCreditLimit,
  partyBalance,
} from '../../lib/dates'
import { AlertTriangle, Building2, ChevronRight } from 'lucide-react'
import type { Party } from '../../types'

function PartyRow({ party }: { party: Party }) {
  const allInvoices = useAppStore((s) => s.invoices)
  const ledger = useAppStore((s) => s.ledger)
  const users = useAppStore((s) => s.users)
  const openParty = useAppStore((s) => s.openParty)
  const assignParty = useAppStore((s) => s.assignParty)
  const currentUser = useCurrentUser()

  const invoiceCount = useMemo(
    () => allInvoices.filter((i) => i.partyId === party.id).length,
    [allInvoices, party.id],
  )
  const balance = useMemo(
    () => partyBalance(ledger.filter((e) => e.partyId === party.id)),
    [ledger, party.id],
  )

  const over = isOverCreditLimit(party, balance)
  const assignee = users.find((u) => u.id === party.assignedTo)

  return (
    <tr className="border-t border-zinc-100 hover:bg-zinc-50/80">
      <td className="px-5 py-3">
        <button
          type="button"
          onClick={() => openParty(party.id)}
          className="flex items-center gap-3 text-left"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
            {party.photo ? (
              <img
                src={party.photo}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-400">
                {party.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-zinc-900">{party.name}</p>
            <p className="text-xs text-zinc-400">
              {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'}
              {party.gstin ? ` · ${party.gstin}` : ''}
            </p>
          </div>
        </button>
      </td>
      <td className="px-3 py-3 font-semibold">
        <span className={balance > 0 ? 'text-red-700' : 'text-emerald-700'}>
          {formatCurrency(Math.abs(balance))}
          {balance > 0 ? ' Dr' : balance < 0 ? ' Cr' : ''}
        </span>
      </td>
      <td className="px-3 py-3 text-sm">
        {formatCurrency(party.creditLimit)}
        {over && (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3 w-3" /> Over limit
          </span>
        )}
      </td>
      {currentUser?.role === 'admin' && (
        <td className="px-3 py-3">
          <select
            value={party.assignedTo ?? ''}
            onChange={(e) =>
              void assignParty(party.id, e.target.value || null).catch((err) =>
                alert(
                  err instanceof Error ? err.message : 'Failed to assign party',
                ),
              )
            }
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--modi-red)]"
          >
            <option value="">Unassigned</option>
            {users
              .filter((u) => u.role === 'user')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </td>
      )}
      {currentUser?.role !== 'admin' && (
        <td className="px-3 py-3 text-sm text-zinc-500">
          {assignee?.name ?? '—'}
        </td>
      )}
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={() => openParty(party.id)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--modi-red)] hover:bg-[var(--modi-red-soft)]"
        >
          Open <ChevronRight className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

export function PartiesTable() {
  const parties = useVisibleParties()
  const currentUser = useCurrentUser()
  const setPage = useAppStore((s) => s.setPage)
  const isAdmin = currentUser?.role === 'admin'

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div>
          <h3 className="font-display text-base font-semibold">Parties</h3>
          <p className="text-xs text-zinc-500">
            Each party holds invoices + ledger · {parties.length} shown
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setPage('scan')}
            className="rounded-full bg-[var(--modi-red)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--modi-red-dark)]"
          >
            Scan invoice PDF
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
            <tr>
              <th className="px-5 py-3 font-semibold">Party</th>
              <th className="px-3 py-3 font-semibold">Balance owed</th>
              <th className="px-3 py-3 font-semibold">Credit limit</th>
              <th className="px-3 py-3 font-semibold">Assigned</th>
              <th className="px-3 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                  <Building2 className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
                  No parties yet. Scan an invoice PDF to create one.
                </td>
              </tr>
            )}
            {parties.map((p) => (
              <PartyRow key={p.id} party={p} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
