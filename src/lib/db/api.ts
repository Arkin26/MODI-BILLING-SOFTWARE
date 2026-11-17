import type { Invoice, LedgerEntry, Party, PartyFile } from '../../types'

export interface DbSnapshot {
  revision: number
  parties: Party[]
  invoices: Invoice[]
  ledger: LedgerEntry[]
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getDbBaseUrl(url: string): string {
  return normalizeBaseUrl(url)
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Modi-Token': token,
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: string }).error)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return body as T
}

export async function healthCheck(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, {
    method: 'GET',
  })
  if (!res.ok) return false
  const data = (await res.json()) as { ok?: boolean }
  return Boolean(data.ok)
}

export async function fetchSnapshot(
  baseUrl: string,
  token: string,
): Promise<DbSnapshot> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/snapshot`, {
    headers: authHeaders(token),
  })
  return parseJson<DbSnapshot>(res)
}

export async function pushFullSnapshot(
  baseUrl: string,
  token: string,
  snapshot: {
    parties: Party[]
    invoices: Invoice[]
    ledger: LedgerEntry[]
  },
): Promise<DbSnapshot> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/snapshot`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(snapshot),
  })
  return parseJson<DbSnapshot>(res)
}

export async function patchParty(
  baseUrl: string,
  token: string,
  partyId: string,
  patch: Partial<Party>,
): Promise<DbSnapshot> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/parties/${encodeURIComponent(partyId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    },
  )
  return parseJson<DbSnapshot>(res)
}

export async function putParty(
  baseUrl: string,
  token: string,
  party: Party,
): Promise<DbSnapshot> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/parties/${encodeURIComponent(party.id)}`,
    {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(party),
    },
  )
  return parseJson<DbSnapshot>(res)
}

export async function patchInvoice(
  baseUrl: string,
  token: string,
  invoiceId: string,
  patch: Partial<Pick<Invoice, 'status' | 'dueDate'>>,
): Promise<DbSnapshot> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/invoices/${encodeURIComponent(invoiceId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    },
  )
  return parseJson<DbSnapshot>(res)
}

export async function postLedgerEntry(
  baseUrl: string,
  token: string,
  entry: LedgerEntry,
): Promise<DbSnapshot> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/ledger`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(entry),
  })
  return parseJson<DbSnapshot>(res)
}

export async function postSaveInvoice(
  baseUrl: string,
  token: string,
  payload: {
    party: Party
    invoice: Invoice
    ledgerEntry?: LedgerEntry | null
  },
): Promise<DbSnapshot> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/save-invoice`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
  return parseJson<DbSnapshot>(res)
}

async function postInvoiceAction(
  baseUrl: string,
  token: string,
  invoiceId: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<DbSnapshot> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/invoices/${encodeURIComponent(invoiceId)}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body || {}),
    },
  )
  return parseJson<DbSnapshot>(res)
}

export function approveInvoice(baseUrl: string, token: string, invoiceId: string) {
  return postInvoiceAction(baseUrl, token, invoiceId, 'approve')
}

export function rejectInvoice(baseUrl: string, token: string, invoiceId: string) {
  return postInvoiceAction(baseUrl, token, invoiceId, 'reject')
}

export function assignCollection(
  baseUrl: string,
  token: string,
  invoiceId: string,
  userId: string,
) {
  return postInvoiceAction(baseUrl, token, invoiceId, 'assign-collection', {
    userId,
  })
}

export function requestPaid(baseUrl: string, token: string, invoiceId: string) {
  return postInvoiceAction(baseUrl, token, invoiceId, 'request-paid')
}

export function confirmPaid(baseUrl: string, token: string, invoiceId: string) {
  return postInvoiceAction(baseUrl, token, invoiceId, 'confirm-paid')
}

export function toWsUrl(baseUrl: string, token: string): string {
  const u = new URL(normalizeBaseUrl(baseUrl))
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/ws'
  u.search = `token=${encodeURIComponent(token)}`
  return u.toString()
}

export async function listPartyFiles(
  baseUrl: string,
  token: string,
  partyId: string,
  opts?: { from?: string; to?: string },
): Promise<PartyFile[]> {
  const u = new URL(
    `${normalizeBaseUrl(baseUrl)}/api/parties/${encodeURIComponent(partyId)}/files`,
  )
  if (opts?.from) u.searchParams.set('from', opts.from)
  if (opts?.to) u.searchParams.set('to', opts.to)
  const res = await fetch(u.toString(), { headers: authHeaders(token) })
  const data = await parseJson<{ files: PartyFile[] }>(res)
  return data.files
}

export async function uploadPartyFile(
  baseUrl: string,
  token: string,
  partyId: string,
  input: { file: File; title: string; fileDate: string },
): Promise<PartyFile> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('title', input.title)
  form.append('fileDate', input.fileDate)
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/parties/${encodeURIComponent(partyId)}/files`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Modi-Token': token,
      },
      body: form,
    },
  )
  const data = await parseJson<{ file: PartyFile }>(res)
  return data.file
}

export async function deletePartyFileRemote(
  baseUrl: string,
  token: string,
  fileId: string,
): Promise<void> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/party-files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
  )
  await parseJson<{ ok: boolean }>(res)
}

export function partyFileContentUrl(
  baseUrl: string,
  token: string,
  fileId: string,
): string {
  const u = new URL(
    `${normalizeBaseUrl(baseUrl)}/api/party-files/${encodeURIComponent(fileId)}/content`,
  )
  u.searchParams.set('token', token)
  return u.toString()
}

/** Fetch file bytes with auth (works in Electron file:// UI). */
export async function fetchPartyFileBlob(
  baseUrl: string,
  token: string,
  fileId: string,
): Promise<Blob> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/party-files/${encodeURIComponent(fileId)}/content`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Modi-Token': token,
      },
    },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: string }).error)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.blob()
}
