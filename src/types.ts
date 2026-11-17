export type UserRole = 'admin' | 'user'

export type InvoiceStatus =
  | 'open'
  | 'paid'
  | 'in_progress'
  | 'pending_approval'
  | 'awaiting_payment_confirm'


export type NotificationType = 'due_soon' | 'due_today' | 'overdue'

export type LedgerEntryType = 'opening' | 'sale' | 'receipt' | 'journal'

export interface User {
  id: string
  username: string
  name: string
  email: string
  role: UserRole
}

export interface Party {
  id: string
  name: string
  address?: string
  gstin?: string
  phone?: string
  /** Max amount this party can owe (editable). */
  creditLimit: number
  /** Base64 data URL of party avatar (stored locally / in DB). */
  photo?: string | null
  createdAt: string
  assignedTo: string | null
}

/** Party photo / PDF attachment (separate from invoices). */
export interface PartyFile {
  id: string
  partyId: string
  title: string
  originalName?: string
  mimeType: string
  kind: 'image' | 'pdf' | 'other'
  fileDate: string
  createdAt?: string
  /** Local-only: data URL when not using office server */
  dataUrl?: string | null
}

export interface InvoiceLineItem {
  id: string
  description: string
  hsn?: string
  qty: number
  unit?: string
  rate: number
  amount: number
}

export interface Invoice {
  id: string
  partyId: string
  billNo?: string
  /** Date on the invoice / when goods were billed. */
  invoiceDate: string
  /** Payment deadline for this invoice (manual). */
  dueDate: string
  amount: number
  status: InvoiceStatus
  /** Who scanned / submitted this bill (local user id). */
  submittedBy?: string | null
  /** Staff assigned to collect payment (local user id). */
  collectionAssignedTo?: string | null
  lineItems: InvoiceLineItem[]
  pdfName: string | null
  createdAt: string
  notes?: string
}

export interface LedgerEntry {
  id: string
  partyId: string
  date: string
  type: LedgerEntryType
  voucherNo?: string
  particular: string
  debit: number
  credit: number
  invoiceId?: string | null
}

export interface AppNotification {
  id: string
  invoiceId: string
  partyId: string
  userId: string
  type: NotificationType
  forDate: string
  message: string
  read: boolean
}

export type PageId =
  | 'dashboard'
  | 'parties'
  | 'party'
  | 'scan'
  | 'database'

export interface ExtractedInvoiceFields {
  partyName: string
  billNo: string
  invoiceDate: string
  amount: number
  address?: string
  gstin?: string
  phone?: string
  lineItems: Omit<InvoiceLineItem, 'id'>[]
  confidence: 'high' | 'medium' | 'low'
  rawTextPreview: string
}

declare global {
  interface Window {
    modiDesktop?: {
      openPdfDialog: () => Promise<string | null>
      isElectron: boolean
      officeBootstrap?: { apiUrl?: string; apiToken?: string }
      getOfficeBootstrap?: () => Promise<{
        apiUrl?: string
        apiToken?: string
      } | null>
      completeOfficeSetup?: (payload: {
        password: string
        port?: number
        adminUsername?: string
        adminPassword?: string
        adminName?: string
      }) => Promise<{ ok: boolean; error?: string; apiUrl?: string; apiToken?: string }>
    }
  }
}
