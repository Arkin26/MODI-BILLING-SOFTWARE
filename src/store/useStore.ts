import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEMO_USERS, SEED_INVOICES, SEED_LEDGER, SEED_PARTIES, USERS } from '../data/seed'
import { ensureDemoNotifications } from '../lib/notifications'
import { addDaysIso, partyBalance } from '../lib/dates'
import {
  approveInvoice,
  assignCollection,
  confirmPaid,
  fetchSnapshot,
  healthCheck,
  patchInvoice,
  patchParty,
  postLedgerEntry,
  postSaveInvoice,
  pushFullSnapshot,
  rejectInvoice,
  requestPaid,
  type DbSnapshot,
} from '../lib/db/api'
import { connectLiveSync, disconnectLiveSync, setLiveSyncHandlers } from '../lib/db/liveSync'
import type {
  AppNotification,
  ExtractedInvoiceFields,
  Invoice,
  InvoiceStatus,
  LedgerEntry,
  PageId,
  Party,
  PartyFile,
  User,
} from '../types'

interface AppState {
  users: User[]
  currentUserId: string
  authReady: boolean
  parties: Party[]
  invoices: Invoice[]
  ledger: LedgerEntry[]
  /** Local cache of party photos/PDFs when office DB is not connected */
  partyFiles: PartyFile[]
  notifications: AppNotification[]
  page: PageId
  selectedPartyId: string | null
  search: string
  /** Local API base URL, e.g. http://192.168.1.50:8787 */
  dbUrl: string
  /** Shared API token (MODI_API_TOKEN on server) */
  dbKey: string
  dbConnected: boolean
  dbConnecting: boolean
  dbMessage: string | null
  dbRevision: number
  liveSyncStatus: 'off' | 'connecting' | 'open' | 'closed' | 'error'
  networkOnline: boolean
  /** When true, mutations refuse if DB is not connected (max safety). */
  requireDbForWrites: boolean
  /** Browser-only demo — no Postgres / API required. */
  demoMode: boolean

  setUsers: (users: User[]) => void
  setCurrentUserId: (userId: string) => void
  setAuthReady: (ready: boolean) => void
  setPage: (page: PageId) => void
  setSearch: (search: string) => void
  setNetworkOnline: (online: boolean) => void
  openParty: (partyId: string) => void
  switchUser: (userId: string) => void
  enterLocalDemo: (asRole?: 'admin' | 'user') => void
  exitLocalDemo: () => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  applySnapshot: (snapshot: DbSnapshot) => void
  addLocalPartyFile: (file: PartyFile) => void
  removeLocalPartyFile: (fileId: string) => void
  assignParty: (partyId: string, userId: string | null) => Promise<void>
  setPartyCreditLimit: (partyId: string, creditLimit: number) => Promise<void>
  setPartyPhoto: (partyId: string, photo: string | null) => Promise<void>
  updateInvoiceStatus: (
    invoiceId: string,
    status: InvoiceStatus,
  ) => Promise<void>
  setInvoiceDueDate: (invoiceId: string, dueDate: string) => Promise<void>
  addPayment: (
    partyId: string,
    amount: number,
    particular: string,
    date: string,
  ) => Promise<void>
  saveScannedInvoice: (input: {
    extracted: ExtractedInvoiceFields
    dueDate: string
    pdfName: string | null
    assignedTo: string | null
    creditLimit?: number
  }) => Promise<{
    partyId: string
    overLimit: boolean
    balance: number
    pendingApproval: boolean
  }>
  approvePendingInvoice: (invoiceId: string) => Promise<void>
  rejectPendingInvoice: (invoiceId: string) => Promise<void>
  assignCollectionTask: (invoiceId: string, userId: string) => Promise<void>
  markCollectionDone: (invoiceId: string) => Promise<void>
  confirmInvoicePaid: (invoiceId: string) => Promise<void>
  setDbFields: (url: string, key: string) => void
  tryConnectDb: (opts?: { pushLocalIfEmpty?: boolean }) => Promise<void>
  disconnectDb: () => void
  resetDemoData: () => Promise<void>
  bootstrapDbFromSavedSettings: () => Promise<void>
}

function withNotifications(
  invoices: Invoice[],
  parties: Party[],
  userId: string,
  users: User[],
  existing: AppNotification[],
): AppNotification[] {
  const user = users.find((u) => u.id === userId)
  return ensureDemoNotifications(
    invoices,
    parties,
    userId,
    user?.role === 'admin',
    existing,
  )
}

function slugPartyId(name: string): string {
  return `party-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}-${Date.now().toString(36)}`
}

function applySnapshotToState(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  snapshot: DbSnapshot,
) {
  const { currentUserId, users, notifications, dbRevision } = get()
  if (snapshot.revision < dbRevision) return
  set({
    parties: snapshot.parties,
    invoices: snapshot.invoices,
    ledger: snapshot.ledger,
    dbRevision: snapshot.revision,
    notifications: withNotifications(
      snapshot.invoices,
      snapshot.parties,
      currentUserId,
      users,
      notifications,
    ),
  })
}

async function requireRemote(
  get: () => AppState,
): Promise<{ url: string; token: string } | null> {
  const { dbConnected, dbUrl, dbKey, requireDbForWrites } = get()
  if (dbConnected && dbUrl.trim() && dbKey.trim()) {
    return { url: dbUrl.trim(), token: dbKey.trim() }
  }
  if (requireDbForWrites) {
    throw new Error(
      'Not connected to the office database. Open Database and connect before saving.',
    )
  }
  return null
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      users: USERS,
      currentUserId: '',
      authReady: false,
      parties: [],
      invoices: [],
      ledger: [],
      partyFiles: [],
      notifications: [],
      page: 'dashboard',
      selectedPartyId: null,
      search: '',
      dbUrl: '',
      dbKey: '',
      dbConnected: false,
      dbConnecting: false,
      dbMessage: null,
      dbRevision: 0,
      liveSyncStatus: 'off',
      networkOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      requireDbForWrites: false,
      demoMode: false,

      setUsers: (users) => set({ users }),
      setCurrentUserId: (currentUserId) => set({ currentUserId }),
      setAuthReady: (authReady) => set({ authReady }),
      setPage: (page) => set({ page }),
      setSearch: (search) => set({ search }),
      setNetworkOnline: (networkOnline) => set({ networkOnline }),

      openParty: (partyId) =>
        set({ selectedPartyId: partyId, page: 'party' }),

      switchUser: (userId) => {
        const { invoices, parties, users, notifications } = get()
        set({
          currentUserId: userId,
          notifications: withNotifications(
            invoices,
            parties,
            userId,
            users,
            notifications,
          ),
          page: 'dashboard',
          selectedPartyId: null,
        })
      },

      enterLocalDemo: (asRole = 'admin') => {
        const users = DEMO_USERS
        const currentUserId =
          users.find((u) => u.role === asRole)?.id ?? users[0]!.id
        set({
          demoMode: true,
          dbConnected: false,
          dbUrl: '',
          dbKey: '',
          requireDbForWrites: false,
          liveSyncStatus: 'off',
          users,
          currentUserId,
          authReady: true,
          parties: SEED_PARTIES,
          invoices: SEED_INVOICES,
          ledger: SEED_LEDGER,
          partyFiles: [],
          notifications: withNotifications(
            SEED_INVOICES,
            SEED_PARTIES,
            currentUserId,
            users,
            [],
          ),
          page: 'dashboard',
          selectedPartyId: null,
          search: '',
          dbMessage: 'Demo mode — data stays in this browser only.',
        })
      },

      exitLocalDemo: () => {
        set({
          demoMode: false,
          users: [],
          currentUserId: '',
          authReady: true,
          parties: [],
          invoices: [],
          ledger: [],
          partyFiles: [],
          notifications: [],
          page: 'dashboard',
          selectedPartyId: null,
          dbMessage: null,
        })
      },

      markNotificationRead: (id) =>
        set({
          notifications: get().notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        }),

      markAllNotificationsRead: () =>
        set({
          notifications: get().notifications.map((n) => ({ ...n, read: true })),
        }),

      applySnapshot: (snapshot) => applySnapshotToState(set, get, snapshot),

      addLocalPartyFile: (file) =>
        set({ partyFiles: [...get().partyFiles, file] }),

      removeLocalPartyFile: (fileId) =>
        set({
          partyFiles: get().partyFiles.filter((f) => f.id !== fileId),
        }),

      assignParty: async (partyId, userId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await patchParty(remote.url, remote.token, partyId, {
            assignedTo: userId,
          })
          applySnapshotToState(set, get, snapshot)
          return
        }
        const parties = get().parties.map((p) =>
          p.id === partyId ? { ...p, assignedTo: userId } : p,
        )
        const { invoices, currentUserId, users, notifications } = get()
        set({
          parties,
          notifications: withNotifications(
            invoices,
            parties,
            currentUserId,
            users,
            notifications,
          ),
        })
      },

      setPartyCreditLimit: async (partyId, creditLimit) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await patchParty(remote.url, remote.token, partyId, {
            creditLimit,
          })
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({
          parties: get().parties.map((p) =>
            p.id === partyId ? { ...p, creditLimit } : p,
          ),
        })
      },

      setPartyPhoto: async (partyId, photo) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await patchParty(remote.url, remote.token, partyId, {
            photo,
          })
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({
          parties: get().parties.map((p) =>
            p.id === partyId ? { ...p, photo } : p,
          ),
        })
      },

      updateInvoiceStatus: async (invoiceId, status) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await patchInvoice(
            remote.url,
            remote.token,
            invoiceId,
            { status },
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        const invoices = get().invoices.map((inv) =>
          inv.id === invoiceId ? { ...inv, status } : inv,
        )
        const { parties, currentUserId, users, notifications } = get()
        set({
          invoices,
          notifications: withNotifications(
            invoices,
            parties,
            currentUserId,
            users,
            notifications,
          ),
        })
      },

      setInvoiceDueDate: async (invoiceId, dueDate) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await patchInvoice(
            remote.url,
            remote.token,
            invoiceId,
            { dueDate },
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        const invoices = get().invoices.map((inv) =>
          inv.id === invoiceId ? { ...inv, dueDate } : inv,
        )
        const { parties, currentUserId, users, notifications } = get()
        set({
          invoices,
          notifications: withNotifications(
            invoices,
            parties,
            currentUserId,
            users,
            notifications,
          ),
        })
      },

      addPayment: async (partyId, amount, particular, date) => {
        if (amount <= 0) return
        const entry: LedgerEntry = {
          id: `led-${Date.now()}`,
          partyId,
          date,
          type: 'receipt',
          particular: particular || 'Payment received',
          debit: 0,
          credit: amount,
        }
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await postLedgerEntry(
            remote.url,
            remote.token,
            entry,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({ ledger: [...get().ledger, entry] })
      },

      saveScannedInvoice: async ({
        extracted,
        dueDate,
        pdfName,
        assignedTo,
        creditLimit,
      }) => {
        const {
          parties,
          invoices,
          ledger,
          currentUserId,
          users,
          notifications,
        } = get()
        const me = users.find((u) => u.id === currentUserId)
        const isAdmin = me?.role === 'admin'
        const nameKey = extracted.partyName.trim().toLowerCase()
        let party = parties.find((p) => p.name.trim().toLowerCase() === nameKey)

        let nextParties = parties
        if (!party) {
          party = {
            id: slugPartyId(extracted.partyName),
            name: extracted.partyName.trim(),
            address: extracted.address,
            gstin: extracted.gstin,
            phone: extracted.phone,
            creditLimit: creditLimit ?? 50000,
            createdAt: new Date().toISOString().slice(0, 10),
            assignedTo,
          }
          nextParties = [...parties, party]
        } else {
          nextParties = parties.map((p) =>
            p.id === party!.id
              ? {
                  ...p,
                  assignedTo: assignedTo ?? p.assignedTo,
                  address: extracted.address || p.address,
                  gstin: extracted.gstin || p.gstin,
                  phone: extracted.phone || p.phone,
                  creditLimit: creditLimit ?? p.creditLimit,
                }
              : p,
          )
          party = nextParties.find((p) => p.id === party!.id)!
        }

        const invoice: Invoice = {
          id: `inv-${Date.now()}`,
          partyId: party.id,
          billNo: extracted.billNo || undefined,
          invoiceDate: extracted.invoiceDate,
          dueDate: dueDate || addDaysIso(extracted.invoiceDate, 15),
          amount: extracted.amount,
          status: isAdmin ? 'open' : 'pending_approval',
          submittedBy: currentUserId || null,
          collectionAssignedTo: null,
          pdfName,
          createdAt: new Date().toISOString().slice(0, 10),
          lineItems: extracted.lineItems.map((li, i) => ({
            ...li,
            id: `li-${Date.now()}-${i}`,
          })),
        }

        const saleEntry: LedgerEntry | null = isAdmin
          ? {
              id: `led-${Date.now()}`,
              partyId: party.id,
              date: extracted.invoiceDate,
              type: 'sale',
              voucherNo: extracted.billNo || undefined,
              particular: 'Sales',
              debit: extracted.amount,
              credit: 0,
              invoiceId: invoice.id,
            }
          : null

        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await postSaveInvoice(remote.url, remote.token, {
            party,
            invoice,
            ledgerEntry: saleEntry,
          })
          applySnapshotToState(set, get, snapshot)
          const balance = partyBalance(
            snapshot.ledger.filter((e) => e.partyId === party!.id),
          )
          set({ selectedPartyId: party.id, page: 'party' })
          return {
            partyId: party.id,
            overLimit: isAdmin && balance > party.creditLimit,
            balance,
            pendingApproval: !isAdmin,
          }
        }

        const nextInvoices = [...invoices, invoice]
        const nextLedger = saleEntry ? [...ledger, saleEntry] : ledger
        const balance = partyBalance(
          nextLedger.filter((e) => e.partyId === party!.id),
        )
        const overLimit = isAdmin && balance > party.creditLimit

        set({
          parties: nextParties,
          invoices: nextInvoices,
          ledger: nextLedger,
          notifications: withNotifications(
            nextInvoices,
            nextParties,
            currentUserId,
            users,
            notifications,
          ),
          selectedPartyId: party.id,
          page: 'party',
        })

        return {
          partyId: party.id,
          overLimit,
          balance,
          pendingApproval: !isAdmin,
        }
      },

      approvePendingInvoice: async (invoiceId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await approveInvoice(
            remote.url,
            remote.token,
            invoiceId,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        const inv = get().invoices.find((i) => i.id === invoiceId)
        if (!inv || inv.status !== 'pending_approval') return
        const saleEntry: LedgerEntry = {
          id: `led-${Date.now()}`,
          partyId: inv.partyId,
          date: inv.invoiceDate,
          type: 'sale',
          voucherNo: inv.billNo,
          particular: 'Sales',
          debit: inv.amount,
          credit: 0,
          invoiceId: inv.id,
        }
        set({
          invoices: get().invoices.map((i) =>
            i.id === invoiceId ? { ...i, status: 'open' } : i,
          ),
          ledger: [...get().ledger, saleEntry],
        })
      },

      rejectPendingInvoice: async (invoiceId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await rejectInvoice(
            remote.url,
            remote.token,
            invoiceId,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({
          invoices: get().invoices.filter((i) => i.id !== invoiceId),
        })
      },

      assignCollectionTask: async (invoiceId, userId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await assignCollection(
            remote.url,
            remote.token,
            invoiceId,
            userId,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({
          invoices: get().invoices.map((i) =>
            i.id === invoiceId
              ? {
                  ...i,
                  status: 'in_progress',
                  collectionAssignedTo: userId,
                }
              : i,
          ),
        })
      },

      markCollectionDone: async (invoiceId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await requestPaid(
            remote.url,
            remote.token,
            invoiceId,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        set({
          invoices: get().invoices.map((i) =>
            i.id === invoiceId
              ? { ...i, status: 'awaiting_payment_confirm' }
              : i,
          ),
        })
      },

      confirmInvoicePaid: async (invoiceId) => {
        const remote = await requireRemote(get)
        if (remote) {
          const snapshot = await confirmPaid(
            remote.url,
            remote.token,
            invoiceId,
          )
          applySnapshotToState(set, get, snapshot)
          return
        }
        const inv = get().invoices.find((i) => i.id === invoiceId)
        if (!inv) return
        const receipt: LedgerEntry = {
          id: `led-paid-${Date.now()}`,
          partyId: inv.partyId,
          date: new Date().toISOString().slice(0, 10),
          type: 'receipt',
          voucherNo: inv.billNo,
          particular: 'Payment received',
          debit: 0,
          credit: inv.amount,
          invoiceId: inv.id,
        }
        set({
          invoices: get().invoices.map((i) =>
            i.id === invoiceId ? { ...i, status: 'paid' } : i,
          ),
          ledger: [...get().ledger, receipt],
        })
      },

      setDbFields: (dbUrl, dbKey) => set({ dbUrl, dbKey }),

      tryConnectDb: async (opts) => {
        const { dbUrl, dbKey, parties, invoices, ledger } = get()
        if (!dbUrl.trim() || !dbKey.trim()) {
          set({
            dbMessage:
              'Enter the office API URL (e.g. http://192.168.x.x:8787) and API token.',
          })
          return
        }

        set({ dbConnecting: true, dbMessage: 'Connecting to office database…' })
        try {
          const ok = await healthCheck(dbUrl)
          if (!ok) {
            throw new Error(
              'Server health check failed. Is the MODI API running on the server PC?',
            )
          }

          let snapshot = await fetchSnapshot(dbUrl, dbKey)
          const serverEmpty =
            snapshot.parties.length === 0 &&
            snapshot.invoices.length === 0 &&
            snapshot.ledger.length === 0
          const localHasData =
            parties.length > 0 || invoices.length > 0 || ledger.length > 0

          if (opts?.pushLocalIfEmpty && serverEmpty && localHasData) {
            snapshot = await pushFullSnapshot(dbUrl, dbKey, {
              parties,
              invoices,
              ledger,
            })
          }

          applySnapshotToState(set, get, snapshot)

          setLiveSyncHandlers(
            (snap) => get().applySnapshot(snap),
            (status) => {
              set({
                liveSyncStatus: status,
                ...(status === 'open' ? { dbConnected: true } : {}),
              })
            },
          )
          connectLiveSync(dbUrl, dbKey)

          set({
            dbConnected: true,
            dbConnecting: false,
            requireDbForWrites: true,
            liveSyncStatus: 'connecting',
            dbMessage:
              'Connected. Data is stored on the office PC disk. Live sync is on — changes appear instantly for everyone.',
          })
        } catch (err) {
          disconnectLiveSync()
          set({
            dbConnected: false,
            dbConnecting: false,
            requireDbForWrites: false,
            liveSyncStatus: 'off',
            dbMessage: err instanceof Error ? err.message : String(err),
          })
        }
      },

      disconnectDb: () => {
        disconnectLiveSync()
        set({
          dbConnected: false,
          dbConnecting: false,
          requireDbForWrites: false,
          liveSyncStatus: 'off',
          dbMessage:
            'Disconnected. Local cache may still show last data — reconnect to save safely to the office PC.',
        })
      },

      resetDemoData: async () => {
        if (get().demoMode) {
          get().enterLocalDemo(
            get().users.find((u) => u.id === get().currentUserId)?.role ??
              'admin',
          )
          return
        }
        const remote = await requireRemote(get).catch(() => null)
        if (remote) {
          const snapshot = await pushFullSnapshot(remote.url, remote.token, {
            parties: [],
            invoices: [],
            ledger: [],
          })
          applySnapshotToState(set, get, snapshot)
          set({
            partyFiles: [],
            search: '',
            page: 'dashboard',
            selectedPartyId: null,
            dbMessage: 'Cleared all data on the office database.',
          })
          return
        }
        const { currentUserId, users } = get()
        set({
          parties: [],
          invoices: [],
          ledger: [],
          partyFiles: [],
          search: '',
          page: 'dashboard',
          selectedPartyId: null,
          notifications: withNotifications([], [], currentUserId, users, []),
        })
      },

      bootstrapDbFromSavedSettings: async () => {
        const { dbUrl, dbKey, dbConnected } = get()
        if (dbConnected) return
        if (!dbUrl.trim() || !dbKey.trim()) return
        await get().tryConnectDb({ pushLocalIfEmpty: false })
      },
    }),
    {
      name: 'modi-electricals-parties-v3',
      partialize: (state) => ({
        // Cache for offline display only — Postgres on the server PC is source of truth when connected
        parties: state.parties,
        invoices: state.invoices,
        ledger: state.ledger,
        partyFiles: state.partyFiles,
        notifications: state.notifications,
        dbUrl: state.dbUrl,
        dbKey: state.dbKey,
        dbRevision: state.dbRevision,
        demoMode: state.demoMode,
        users: state.demoMode ? state.users : [],
        currentUserId: state.demoMode ? state.currentUserId : '',
      }),
    },
  ),
)
