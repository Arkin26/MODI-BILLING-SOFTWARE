import type { ExtractedInvoiceFields, InvoiceLineItem } from '../types'

import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function cleanMoney(raw: string): number | null {
  const normalized = raw.replace(/[,\s]/g, '').replace(/₹|INR|Rs\.?/gi, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** MODI invoices use DD-MM-YYYY */
function parseDateToken(token: string): string | null {
  const t = token.trim()
  const dmyDash = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (dmyDash) {
    const [, d, m, yRaw] = dmyDash
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = t.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const chunks: string[] = []

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    chunks.push(pageText)
  }

  return chunks.join('\n')
}

function cleanDescription(raw: string): string {
  return raw
    // Drop leaked prior-row amount / rate: "74.76 2 AN LED…" → "AN LED…"
    .replace(/^([\d,]+(?:\.\d+)?\s+)+/g, '')
    // Drop leading serial number if still present: "2 AN LED…" → "AN LED…"
    .replace(/^\d{1,3}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * MODI tax invoice columns:
 * S.N. | Item | HSN | Qty | Unit | List | Disc.% | GST% | Nett Rate | Amount
 * Flat text example:
 * "1 PARAS SQ BOX PVC STD 39172200 24.00 PCS 4.40 40 9%+9% 3.12 74.76 2 AN LED…"
 *
 * Old regex used a bare `(\d+)` serial which matched digits inside nett rates
 * (e.g. "12" from "3.12"), so the next amount leaked into the product name.
 */
function extractLineItems(flat: string): Omit<InvoiceLineItem, 'id'>[] {
  const items: Omit<InvoiceLineItem, 'id'>[] = []
  const rowRe =
    /\b(\d{1,3})\s+([A-Z][A-Z0-9 &/.,+\-]{2,80}?)\s+(\d{8})\s+([\d,.]+)\s+(PCS|ROLL|PKT|NOS|KG|MTR|LOT|SET|BOX)\s+([\d,.]+)\s+([\d.]+)\s+9%\s*\+\s*9%\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\b/gi

  let match: RegExpExecArray | null
  while ((match = rowRe.exec(flat)) !== null) {
    const description = cleanDescription(match[2])
    const hsn = match[3]
    const qty = Number(String(match[4]).replace(/,/g, ''))
    const unit = match[5]
    const nettRate = cleanMoney(match[8]) ?? 0
    const amount = cleanMoney(match[9]) ?? 0
    if (!description || amount <= 0) continue
    items.push({
      description,
      hsn,
      qty,
      unit,
      rate: nettRate,
      amount,
    })
  }

  // Fallback if GST column text differs (still avoid bare \d+ serial traps)
  if (items.length === 0) {
    const looseRe =
      /\b(\d{1,3})\s+([A-Z][A-Z0-9 &/.,+\-]{2,80}?)\s+(\d{8})\s+([\d,.]+)\s+(PCS|ROLL|PKT|NOS|KG|MTR|LOT|SET|BOX)\b([\s\S]{0,80}?)([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?=\s+(?:\d{1,3}\s+[A-Z]|Total|Grand|CGST|SGST|$))/gi
    while ((match = looseRe.exec(flat)) !== null) {
      const description = cleanDescription(match[2])
      const hsn = match[3]
      const qty = Number(String(match[4]).replace(/,/g, ''))
      const unit = match[5]
      const nettRate = cleanMoney(match[7]) ?? 0
      const amount = cleanMoney(match[8]) ?? 0
      if (!description || amount <= 0) continue
      items.push({
        description,
        hsn,
        qty,
        unit,
        rate: nettRate,
        amount,
      })
    }
  }

  return items
}

/**
 * Extractor tuned for MODI ELECTRICALS tax invoices (Party Name, Bill No, Date, line items, Grand Total).
 */
export function parseInvoiceFields(text: string): ExtractedInvoiceFields {
  const flat = text.replace(/\s+/g, ' ').trim()
  let confidence: ExtractedInvoiceFields['confidence'] = 'low'

  let partyName = ''
  const partyMatch =
    flat.match(/Party\s*Name\s*[:\-]+\s*([A-Z0-9 &.,'/+\-]{3,80}?)(?=\s+Party\s+PAN|\s+Address|\s+Bill\s*No)/i) ||
    flat.match(/Party\s*Name\s*[:\-]+\s*([A-Z0-9 &.,'/+\-]{3,80})/i) ||
    flat.match(/Account\s*:\s*([A-Z0-9 &.,'/+\-]{3,80})/i)
  if (partyMatch) {
    partyName = partyMatch[1]
      .replace(/\s+Party\s+PAN.*$/i, '')
      .replace(/\s+Address.*$/i, '')
      .trim()
    confidence = 'medium'
  }

  let billNo = ''
  // Examples: "Bill No. : - 2910/26-27" or "Bill No.: 2910/26-27"
  const billMatch =
    flat.match(
      /Bill\s*No\.?\s*[:.\-\s]*([0-9][0-9A-Za-z/\-]*)/i,
    ) || flat.match(/\bBill\s*Number\s*[:.\-\s]*([0-9][0-9A-Za-z/\-]*)/i)
  if (billMatch) billNo = billMatch[1].trim().replace(/^-+/, '')

  let invoiceDate = ''
  const dateMatch =
    flat.match(/Date\s*[:\-]+\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i) ||
    flat.match(/Date\s*[:\-]+\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*\(/i)
  if (dateMatch) {
    invoiceDate = parseDateToken(dateMatch[1]) || ''
    if (invoiceDate) confidence = confidence === 'low' ? 'medium' : 'high'
  }

  let gstin: string | undefined
  const gstinMatch = flat.match(/Party\s*GSTIN\s*[:\-]+\s*([0-9A-Z]{10,15})/i)
  if (gstinMatch) gstin = gstinMatch[1]

  let phone: string | undefined
  const phoneMatch = flat.match(/Mobile\s*No\.?\s*[:\-]+\s*(\d{10})/i)
  if (phoneMatch) phone = phoneMatch[1]

  let address: string | undefined
  const addressMatch = flat.match(/Address\s*[:\-]+\s*([^:]{10,80}?)(?=\s+Aadhaar|\s+48200|\s+Mobile|\s+Party\s*GSTIN)/i)
  if (addressMatch) address = addressMatch[1].trim()

  let amount = 0
  // "Grand Total …. 123.00 Units 17,084.00" — take amount after Units, else largest money on that slice
  const grandSlice = flat.match(/Grand\s*Total(.{0,80})/i)
  if (grandSlice) {
    const afterUnits = grandSlice[1].match(
      /[\d,.]+\s*Units\s+([\d,]+\.\d{2})/i,
    )
    if (afterUnits) {
      amount = cleanMoney(afterUnits[1]) ?? 0
    } else {
      const moneys = [...grandSlice[1].matchAll(/([\d,]+\.\d{2})/g)]
        .map((m) => cleanMoney(m[1]))
        .filter((n): n is number => n != null && n > 0)
      if (moneys.length) amount = Math.max(...moneys)
    }
  }
  if (!amount) {
    const grandMatch =
      flat.match(/Grand\s*Total\s+[\d,.]+\s*Units\s+([\d,]+\.?\d*)/i) ||
      flat.match(/Grand\s*Total\s+([\d,]+\.\d{2})/i)
    if (grandMatch) amount = cleanMoney(grandMatch[1]) ?? 0
  }
  if (!amount) {
    const totalMatch = flat.match(/\bTotal\s+([\d,]+\.\d{2})\b/i)
    if (totalMatch) amount = cleanMoney(totalMatch[1]) ?? 0
  }

  const lineItems = extractLineItems(flat)
  if (lineItems.length && !amount) {
    amount =
      Math.round(lineItems.reduce((s, i) => s + i.amount, 0) * 100) / 100
  }

  if (!partyName) partyName = 'Unknown Party'
  if (!invoiceDate) {
    const anyDate = flat.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/)
    invoiceDate =
      (anyDate && parseDateToken(anyDate[1])) ||
      new Date().toISOString().slice(0, 10)
  }
  if (!amount) {
    const nums = [...flat.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d+)?)/g)]
      .map((m) => cleanMoney(m[1]))
      .filter((n): n is number => n != null && n > 100)
    if (nums.length) amount = Math.max(...nums)
  }

  if (partyName !== 'Unknown Party' && amount > 0 && lineItems.length > 0) {
    confidence = 'high'
  } else if (partyName !== 'Unknown Party' && amount > 0) {
    confidence = 'medium'
  }

  return {
    partyName,
    billNo,
    invoiceDate,
    amount,
    address,
    gstin,
    phone,
    lineItems,
    confidence,
    rawTextPreview: flat.slice(0, 500),
  }
}

export async function extractInvoiceFromPdfFile(
  file: File,
): Promise<ExtractedInvoiceFields> {
  const text = await extractTextFromPdf(file)
  return parseInvoiceFields(text)
}
