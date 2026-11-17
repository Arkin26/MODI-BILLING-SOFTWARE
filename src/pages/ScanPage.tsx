import { useRef, useState } from 'react'
import { AlertTriangle, FileUp, Loader2, Sparkles } from 'lucide-react'
import { useAppStore } from '../store/useStore'
import { extractInvoiceFromPdfFile } from '../lib/pdfExtract'
import type { ExtractedInvoiceFields } from '../types'
import { addDaysIso, formatCurrency, formatMoney } from '../lib/dates'

export function ScanPage() {
  const saveScannedInvoice = useAppStore((s) => s.saveScannedInvoice)
  const users = useAppStore((s) => s.users)
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedInvoiceFields | null>(
    null,
  )
  const [warning, setWarning] = useState<string | null>(null)
  const [form, setForm] = useState({
    partyName: '',
    billNo: '',
    invoiceDate: '',
    dueDate: '',
    amount: '',
    creditLimit: '50000',
    assignedTo: '',
  })

  async function handleFile(file: File) {
    setError(null)
    setWarning(null)
    setLoading(true)
    setFileName(file.name)
    try {
      const fields = await extractInvoiceFromPdfFile(file)
      setExtracted(fields)
      setForm({
        partyName: fields.partyName,
        billNo: fields.billNo,
        invoiceDate: fields.invoiceDate,
        dueDate: addDaysIso(fields.invoiceDate, 15),
        amount: String(fields.amount || ''),
        creditLimit: '50000',
        assignedTo: '',
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read this PDF. Enter fields manually.',
      )
      setExtracted(null)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    const amount = Number(String(form.amount).replace(/,/g, ''))
    if (!form.partyName.trim() || !form.invoiceDate || !Number.isFinite(amount)) {
      setError('Party name, invoice date, and amount are required.')
      return
    }

    const payload: ExtractedInvoiceFields = {
      partyName: form.partyName.trim(),
      billNo: form.billNo,
      invoiceDate: form.invoiceDate,
      amount,
      address: extracted?.address,
      gstin: extracted?.gstin,
      phone: extracted?.phone,
      lineItems:
        extracted?.lineItems?.length
          ? extracted.lineItems
          : [
              {
                description: 'Invoice total',
                qty: 1,
                unit: 'LOT',
                rate: amount,
                amount,
              },
            ],
      confidence: extracted?.confidence ?? 'low',
      rawTextPreview: extracted?.rawTextPreview ?? '',
    }

    setLoading(true)
    setError(null)
    try {
      const result = await saveScannedInvoice({
        extracted: payload,
        dueDate: form.dueDate || addDaysIso(form.invoiceDate, 15),
        pdfName: fileName,
        assignedTo: form.assignedTo || null,
        creditLimit: Number(form.creditLimit) || 50000,
      })

      if (result.pendingApproval) {
        setWarning(
          'Bill submitted for admin approval. It will appear on the party after the admin verifies it.',
        )
      } else if (result.overLimit) {
        setWarning(
          `Saved under party, but balance ${formatCurrency(result.balance)} is over the credit limit.`,
        )
      } else {
        setWarning(null)
      }
      setExtracted(null)
      setFileName(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-[var(--modi-red-soft)] p-3 text-[var(--modi-red)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Scan tax invoice</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Upload a MODI ELECTRICALS invoice PDF. Bill number and grand total
              are read automatically. Staff submissions go to admin for approval
              before the party ledger updates.
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />

        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center transition hover:border-[var(--modi-red)] hover:bg-[var(--modi-red-soft)]/40"
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-[var(--modi-red)]" />
          ) : (
            <FileUp className="h-8 w-8 text-[var(--modi-red)]" />
          )}
          <span className="font-semibold text-zinc-800">
            {loading ? 'Reading PDF…' : 'Choose invoice PDF'}
          </span>
          <span className="text-xs text-zinc-500">
            Tuned for Party Name / Bill No / line items / Grand Total
          </span>
        </button>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {warning && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {warning}
          </p>
        )}
      </div>

      {(extracted || form.partyName) && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">
              Confirm & set deadline
            </h3>
            {extracted && (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 capitalize">
                Confidence: {extracted.confidence}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-zinc-600">Party name</span>
              <input
                value={form.partyName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, partyName: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-600">Bill No</span>
              <input
                value={form.billNo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, billNo: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-600">
                Invoice date (came in)
              </span>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceDate: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-600">
                Payment deadline (per invoice)
              </span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-600">Amount (INR)</span>
              <input
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-600">
                Party credit limit (if new)
              </span>
              <input
                value={form.creditLimit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, creditLimit: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-zinc-600">
                Assign party to user
              </span>
              <select
                value={form.assignedTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, assignedTo: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-[var(--modi-red)]"
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
            </label>
          </div>

          {extracted && extracted.lineItems.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-100">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2 text-right">Nett rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.lineItems.map((li, i) => (
                    <tr key={i} className="border-t border-zinc-50">
                      <td className="px-3 py-2">{li.description}</td>
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
                      colSpan={3}
                      className="px-3 py-2 text-right font-semibold"
                    >
                      Invoice total
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatMoney(
                        Number(form.amount) ||
                          extracted.lineItems.reduce((s, i) => s + i.amount, 0),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={save}
              className="rounded-full bg-[var(--modi-red)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--modi-red-dark)]"
            >
              Save under party
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
