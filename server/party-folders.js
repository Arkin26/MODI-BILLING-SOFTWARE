import fs from 'node:fs'
import path from 'node:path'

/** Safe folder name from party display name */
export function partyFolderSlug(name, id) {
  const base = String(name || 'party')
    .normalize('NFKD')
    .replace(/[^\w\s.-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)
  const shortId = String(id || 'x')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(-8)
  return `${base || 'party'}__${shortId}`
}

export function resolveUnderRoot(root, relOrAbs) {
  const rootAbs = path.resolve(root)
  const abs = path.isAbsolute(relOrAbs)
    ? path.resolve(relOrAbs)
    : path.resolve(rootAbs, relOrAbs)
  const rel = path.relative(rootAbs, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null
  }
  return abs
}

/**
 * Writes / refreshes:
 *   parties/<Name>__<id>/
 *     data.json
 *     photos/
 *     pdfs/
 */
export async function syncPartyFolder(pool, partiesRoot, partyId) {
  fs.mkdirSync(partiesRoot, { recursive: true })

  const { rows: partyRows } = await pool.query(
    `SELECT * FROM public.parties WHERE id = $1`,
    [partyId],
  )
  if (!partyRows.length) return null
  const p = partyRows[0]
  const slug = partyFolderSlug(p.name, p.id)
  const dir = path.join(partiesRoot, slug)
  const photosDir = path.join(dir, 'photos')
  const pdfsDir = path.join(dir, 'pdfs')
  fs.mkdirSync(photosDir, { recursive: true })
  fs.mkdirSync(pdfsDir, { recursive: true })

  const [invoices, ledger, files] = await Promise.all([
    pool.query(
      `SELECT * FROM public.invoices WHERE party_id = $1 ORDER BY invoice_date, id`,
      [partyId],
    ),
    pool.query(
      `SELECT * FROM public.ledger_entries WHERE party_id = $1 ORDER BY entry_date, id`,
      [partyId],
    ),
    pool.query(
      `SELECT * FROM public.party_files WHERE party_id = $1 ORDER BY file_date, id`,
      [partyId],
    ),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    party: {
      id: p.id,
      name: p.name,
      address: p.address,
      gstin: p.gstin,
      phone: p.phone,
      creditLimit: Number(p.credit_limit),
      assignedTo: p.assigned_to,
      createdAt: p.created_at,
    },
    invoices: invoices.rows.map((r) => ({
      id: r.id,
      billNo: r.bill_no,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      amount: Number(r.amount),
      status: r.status,
      pdfName: r.pdf_name,
      notes: r.notes,
      lineItems: r.line_items,
    })),
    ledger: ledger.rows.map((r) => ({
      id: r.id,
      date: r.entry_date,
      type: r.entry_type,
      voucherNo: r.voucher_no,
      particular: r.particular,
      debit: Number(r.debit),
      credit: Number(r.credit),
      invoiceId: r.invoice_id,
    })),
    files: files.rows.map((r) => ({
      id: r.id,
      title: r.title,
      originalName: r.original_name,
      mimeType: r.mime_type,
      kind: r.kind,
      fileDate: r.file_date,
      storagePath: r.storage_path,
    })),
  }

  fs.writeFileSync(
    path.join(dir, 'data.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, 'README.txt'),
    `MODI party backup folder
=======================
Party: ${p.name}
Id: ${p.id}
Updated: ${payload.exportedAt}

Contents:
- data.json     party details, invoices, payments/ledger, file list
- photos/       image uploads
- pdfs/         PDF uploads

This folder is for backup / browsing. The live app still uses Postgres.
`,
    'utf8',
  )

  return { dir, slug }
}

export async function syncAllPartyFolders(pool, partiesRoot) {
  const { rows } = await pool.query(`SELECT id FROM public.parties ORDER BY name`)
  for (const row of rows) {
    await syncPartyFolder(pool, partiesRoot, row.id)
  }
  return rows.length
}
