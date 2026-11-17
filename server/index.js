import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import pg from 'pg'
import { WebSocketServer } from 'ws'
import {
  countUsers,
  createSession,
  createUser,
  deleteSession,
  ensureBootstrapAdmin,
  findUserByUsername,
  listUsers,
  resolveSession,
  verifyPassword,
} from './auth-lib.js'
import {
  partyFolderSlug,
  resolveUnderRoot,
  syncAllPartyFolders,
  syncPartyFolder,
} from './party-folders.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const { Pool } = pg

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const DATABASE_URL = process.env.DATABASE_URL
const API_TOKEN = (process.env.MODI_API_TOKEN || '').trim()
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env')
  process.exit(1)
}
if (!API_TOKEN || API_TOKEN === 'change-me-to-a-long-random-secret') {
  console.error(
    'Set a strong MODI_API_TOKEN in server/.env (not the placeholder).',
  )
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
})

const UPLOADS_DIR =
  process.env.MODI_UPLOADS_DIR ||
  process.env.MODI_PARTIES_DIR ||
  path.join(__dirname, 'parties')
const PARTIES_ROOT = path.resolve(
  process.env.MODI_PARTIES_DIR || UPLOADS_DIR,
)
fs.mkdirSync(PARTIES_ROOT, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      void (async () => {
        try {
          const partyId = String(req.params.partyId || '')
          const { rows } = await pool.query(
            `SELECT id, name FROM public.parties WHERE id = $1`,
            [partyId],
          )
          if (!rows.length) {
            cb(new Error('Party not found — save the party first'))
            return
          }
          const slug = partyFolderSlug(rows[0].name, rows[0].id)
          const kind = String(file.mimetype || '').startsWith('image/')
            ? 'photos'
            : 'pdfs'
          const dir = path.join(PARTIES_ROOT, slug, kind)
          fs.mkdirSync(dir, { recursive: true })
          cb(null, dir)
        } catch (err) {
          cb(err)
        }
      })()
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      cb(null, `${Date.now()}-${safe}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf'
    cb(ok ? null : new Error('Only images and PDFs are allowed'), ok)
  },
})

function fileKind(mime) {
  if (String(mime).startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  return 'other'
}

async function touchPartyFolder(partyId) {
  if (!partyId) return
  try {
    await syncPartyFolder(pool, PARTIES_ROOT, partyId)
  } catch (err) {
    console.warn('[party-folder]', partyId, err.message || err)
  }
}

function mapPartyFile(row) {
  return {
    id: row.id,
    partyId: row.party_id,
    title: row.title,
    originalName: row.original_name ?? undefined,
    mimeType: row.mime_type,
    kind: row.kind,
    fileDate: isoDate(row.file_date),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  }
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function extractToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  const fromHeader = String(req.headers['x-modi-token'] || '').trim()
  if (fromHeader) return fromHeader
  // Allow ?token= for <img> / <iframe> preview (cannot set Authorization)
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token.trim()
  }
  return ''
}

async function isValidAccessToken(token) {
  if (!token) return false
  if (API_TOKEN && timingSafeEqualString(token, API_TOKEN)) return true
  const session = await resolveSession(pool, token)
  return Boolean(session)
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req)
    if (!(await isValidAccessToken(token))) {
      res.status(401).json({ error: 'Unauthorized — sign in or provide API token' })
      return
    }
    const session = await resolveSession(pool, token)
    req.modiUser = session?.user || null
    req.modiToken = token
    next()
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.modiUser || req.modiUser.role !== 'admin') {
      // Machine API token may create users during bootstrap tooling only if no session
      if (API_TOKEN && timingSafeEqualString(req.modiToken || '', API_TOKEN)) {
        next()
        return
      }
      res.status(403).json({ error: 'Admin only' })
      return
    }
    next()
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
}

function mapParty(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? undefined,
    gstin: row.gstin ?? undefined,
    phone: row.phone ?? undefined,
    creditLimit: Number(row.credit_limit),
    photo: row.photo ?? null,
    createdAt: isoDate(row.created_at),
    assignedTo: row.assigned_to ?? null,
  }
}

function mapInvoice(row) {
  return {
    id: row.id,
    partyId: row.party_id,
    billNo: row.bill_no ?? undefined,
    invoiceDate: isoDate(row.invoice_date),
    dueDate: isoDate(row.due_date),
    amount: Number(row.amount),
    status: row.status,
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    pdfName: row.pdf_name ?? null,
    submittedBy: row.submitted_by ?? null,
    collectionAssignedTo: row.collection_assigned_to ?? null,
    createdAt: isoDate(row.created_at),
    notes: row.notes ?? undefined,
  }
}

function mapLedger(row) {
  return {
    id: row.id,
    partyId: row.party_id,
    date: isoDate(row.entry_date),
    type: row.entry_type,
    voucherNo: row.voucher_no ?? undefined,
    particular: row.particular,
    debit: Number(row.debit),
    credit: Number(row.credit),
    invoiceId: row.invoice_id ?? null,
  }
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

async function bumpRevision(client) {
  const { rows } = await client.query(
    `UPDATE public.sync_meta
     SET revision = revision + 1, updated_at = now()
     WHERE id = 1
     RETURNING revision`,
  )
  return Number(rows[0].revision)
}

async function loadSnapshot(client) {
  const [parties, invoices, ledger, meta] = await Promise.all([
    client.query(`SELECT * FROM public.parties ORDER BY name`),
    client.query(`SELECT * FROM public.invoices ORDER BY invoice_date, id`),
    client.query(`SELECT * FROM public.ledger_entries ORDER BY entry_date, id`),
    client.query(`SELECT revision FROM public.sync_meta WHERE id = 1`),
  ])
  return {
    revision: Number(meta.rows[0]?.revision ?? 0),
    parties: parties.rows.map(mapParty),
    invoices: invoices.rows.map(mapInvoice),
    ledger: ledger.rows.map(mapLedger),
  }
}

/** @type {Set<import('ws').WebSocket>} */
const sockets = new Set()

function broadcastSnapshot(snapshot) {
  const payload = JSON.stringify({ type: 'snapshot', ...snapshot })
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(payload)
  }
}

async function withWrite(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    const revision = await bumpRevision(client)
    await client.query('COMMIT')
    const snapshot = await loadSnapshot(pool)
    snapshot.revision = revision
    // Ensure revision matches bumped value even if race
    const live = await pool.query(
      `SELECT revision FROM public.sync_meta WHERE id = 1`,
    )
    snapshot.revision = Number(live.rows[0].revision)
    broadcastSnapshot(snapshot)
    return { result, snapshot }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  } finally {
    client.release()
  }
}

const app = express()
app.disable('x-powered-by')
app.use(
  cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : true,
    credentials: false,
  }),
)
app.use(express.json({ limit: '25mb' }))

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    const users = await countUsers(pool)
    res.json({
      ok: true,
      service: 'modi-local-db',
      durable: true,
      localAuth: true,
      userCount: users,
      partiesRoot: PARTIES_ROOT,
    })
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) })
  }
})

/** Public local login — no cloud */
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' })
      return
    }
    const row = await findUserByUsername(pool, username)
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid username or password' })
      return
    }
    const session = await createSession(pool, row.id)
    res.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: mapUserFromRow(row),
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

function mapUserFromRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
  }
}

/** Create first admin when the database has no users yet */
app.post('/api/auth/bootstrap', async (req, res) => {
  try {
    const n = await countUsers(pool)
    if (n > 0) {
      res.status(409).json({ error: 'Admin already exists — use login' })
      return
    }
    const username = String(req.body?.username || 'admin').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || 'Administrator').trim()
    const { user } = await ensureBootstrapAdmin(pool, {
      username,
      password,
      name,
    })
    const session = await createSession(pool, user.id)
    res.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user,
      created: true,
    })
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = extractToken(req)
    if (token && !(API_TOKEN && timingSafeEqualString(token, API_TOKEN))) {
      await deleteSession(pool, token)
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    if (req.modiUser) {
      res.json({ user: req.modiUser })
      return
    }
    res.status(401).json({ error: 'No user session' })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get('/api/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json({ users: await listUsers(pool) })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    const role = req.body?.role === 'admin' ? 'admin' : 'user'
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      res.status(400).json({ error: 'Invalid username' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }
    if (!name) {
      res.status(400).json({ error: 'Name required' })
      return
    }
    const existing = await findUserByUsername(pool, username)
    if (existing) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }
    const user = await createUser(pool, { username, password, name, role })
    res.json({ user })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.use('/api', requireAuth)

app.get('/api/snapshot', async (_req, res) => {
  try {
    const snapshot = await loadSnapshot(pool)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.put('/api/parties/:id', async (req, res) => {
  try {
    const p = req.body
    const { snapshot } = await withWrite(async (client) => {
      await client.query(
        `INSERT INTO public.parties
          (id, name, address, gstin, phone, credit_limit, photo, assigned_to, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           address = EXCLUDED.address,
           gstin = EXCLUDED.gstin,
           phone = EXCLUDED.phone,
           credit_limit = EXCLUDED.credit_limit,
           photo = EXCLUDED.photo,
           assigned_to = EXCLUDED.assigned_to`,
        [
          req.params.id,
          p.name,
          p.address ?? null,
          p.gstin ?? null,
          p.phone ?? null,
          p.creditLimit ?? 50000,
          p.photo ?? null,
          p.assignedTo ?? null,
          p.createdAt ?? new Date().toISOString().slice(0, 10),
        ],
      )
    })
    void touchPartyFolder(req.params.id)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.patch('/api/parties/:id', async (req, res) => {
  try {
    const patch = req.body || {}
    const { snapshot } = await withWrite(async (client) => {
      const fields = []
      const values = []
      let i = 1
      const map = {
        name: 'name',
        address: 'address',
        gstin: 'gstin',
        phone: 'phone',
        creditLimit: 'credit_limit',
        photo: 'photo',
        assignedTo: 'assigned_to',
      }
      for (const [key, col] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          fields.push(`${col} = $${i++}`)
          values.push(patch[key])
        }
      }
      if (!fields.length) return
      values.push(req.params.id)
      await client.query(
        `UPDATE public.parties SET ${fields.join(', ')} WHERE id = $${i}`,
        values,
      )
    })
    void touchPartyFolder(req.params.id)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.patch('/api/invoices/:id', async (req, res) => {
  try {
    const patch = req.body || {}
    let partyId = null
    const { snapshot } = await withWrite(async (client) => {
      const cur = await client.query(
        `SELECT party_id FROM public.invoices WHERE id = $1`,
        [req.params.id],
      )
      partyId = cur.rows[0]?.party_id || null
      const fields = []
      const values = []
      let i = 1
      if (patch.status != null) {
        fields.push(`status = $${i++}`)
        values.push(patch.status)
      }
      if (patch.dueDate != null) {
        fields.push(`due_date = $${i++}::date`)
        values.push(patch.dueDate)
      }
      if (!fields.length) return
      values.push(req.params.id)
      await client.query(
        `UPDATE public.invoices SET ${fields.join(', ')} WHERE id = $${i}`,
        values,
      )
    })
    if (partyId) void touchPartyFolder(partyId)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/api/ledger', async (req, res) => {
  try {
    const e = req.body
    if (!e?.id || !e?.partyId || !e?.date || e.credit == null) {
      res.status(400).json({ error: 'Invalid ledger entry' })
      return
    }
    const { snapshot } = await withWrite(async (client) => {
      await client.query(
        `INSERT INTO public.ledger_entries
          (id, party_id, entry_date, entry_type, voucher_no, particular, debit, credit, invoice_id)
         VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)`,
        [
          e.id,
          e.partyId,
          e.date,
          e.type || 'receipt',
          e.voucherNo ?? null,
          e.particular || 'Payment received',
          Number(e.debit) || 0,
          Number(e.credit) || 0,
          e.invoiceId ?? null,
        ],
      )
    })
    void touchPartyFolder(e.partyId)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/api/save-invoice', async (req, res) => {
  try {
    const { party, invoice, ledgerEntry } = req.body || {}
    if (!party?.id || !invoice?.id) {
      res.status(400).json({ error: 'party and invoice required' })
      return
    }
    const status = invoice.status || 'open'
    const needsLedger =
      status !== 'pending_approval' && ledgerEntry?.id

    const { snapshot } = await withWrite(async (client) => {
      await client.query(
        `INSERT INTO public.parties
          (id, name, address, gstin, phone, credit_limit, photo, assigned_to, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           address = COALESCE(EXCLUDED.address, public.parties.address),
           gstin = COALESCE(EXCLUDED.gstin, public.parties.gstin),
           phone = COALESCE(EXCLUDED.phone, public.parties.phone),
           credit_limit = EXCLUDED.credit_limit,
           photo = COALESCE(EXCLUDED.photo, public.parties.photo),
           assigned_to = COALESCE(EXCLUDED.assigned_to, public.parties.assigned_to)`,
        [
          party.id,
          party.name,
          party.address ?? null,
          party.gstin ?? null,
          party.phone ?? null,
          party.creditLimit ?? 50000,
          party.photo ?? null,
          party.assignedTo ?? null,
          party.createdAt ?? new Date().toISOString().slice(0, 10),
        ],
      )
      await client.query(
        `INSERT INTO public.invoices
          (id, party_id, bill_no, invoice_date, due_date, amount, status, pdf_name, notes, line_items, submitted_by, collection_assigned_to, created_at)
         VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::date)`,
        [
          invoice.id,
          invoice.partyId,
          invoice.billNo ?? null,
          invoice.invoiceDate,
          invoice.dueDate,
          invoice.amount,
          status,
          invoice.pdfName ?? null,
          invoice.notes ?? null,
          JSON.stringify(invoice.lineItems || []),
          invoice.submittedBy ?? null,
          invoice.collectionAssignedTo ?? null,
          invoice.createdAt ?? new Date().toISOString().slice(0, 10),
        ],
      )
      if (needsLedger) {
        await client.query(
          `INSERT INTO public.ledger_entries
            (id, party_id, entry_date, entry_type, voucher_no, particular, debit, credit, invoice_id)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)`,
          [
            ledgerEntry.id,
            ledgerEntry.partyId,
            ledgerEntry.date,
            ledgerEntry.type || 'sale',
            ledgerEntry.voucherNo ?? null,
            ledgerEntry.particular || 'Sales',
            Number(ledgerEntry.debit) || 0,
            Number(ledgerEntry.credit) || 0,
            ledgerEntry.invoiceId ?? invoice.id,
          ],
        )
      }
    })
    void touchPartyFolder(party.id)
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Admin approves a scanned bill → open + sales ledger */
app.post('/api/invoices/:id/approve', async (req, res) => {
  try {
    let partyId = null
    const { snapshot } = await withWrite(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM public.invoices WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!rows.length) throw new Error('Invoice not found')
      const inv = rows[0]
      if (inv.status !== 'pending_approval') {
        throw new Error('Invoice is not awaiting approval')
      }
      partyId = inv.party_id
      await client.query(
        `UPDATE public.invoices SET status = 'open', updated_at = now() WHERE id = $1`,
        [inv.id],
      )
      await client.query(
        `INSERT INTO public.ledger_entries
          (id, party_id, entry_date, entry_type, voucher_no, particular, debit, credit, invoice_id)
         VALUES ($1,$2,$3::date,'sale',$4,'Sales',$5,0,$6)`,
        [
          `led-approve-${Date.now()}`,
          inv.party_id,
          inv.invoice_date,
          inv.bill_no,
          Number(inv.amount),
          inv.id,
        ],
      )
    })
    if (partyId) void touchPartyFolder(partyId)
    res.json(snapshot)
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

/** Admin rejects pending bill */
app.post('/api/invoices/:id/reject', async (req, res) => {
  try {
    const { snapshot } = await withWrite(async (client) => {
      const { rows } = await client.query(
        `SELECT party_id, status FROM public.invoices WHERE id = $1`,
        [req.params.id],
      )
      if (!rows.length) throw new Error('Invoice not found')
      if (rows[0].status !== 'pending_approval') {
        throw new Error('Invoice is not awaiting approval')
      }
      await client.query(`DELETE FROM public.invoices WHERE id = $1`, [
        req.params.id,
      ])
      return rows[0].party_id
    })
    res.json(snapshot)
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

/** Admin assigns collection task to a user */
app.post('/api/invoices/:id/assign-collection', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim()
    if (!userId) {
      res.status(400).json({ error: 'userId required' })
      return
    }
    const { snapshot } = await withWrite(async (client) => {
      const { rows } = await client.query(
        `SELECT status FROM public.invoices WHERE id = $1`,
        [req.params.id],
      )
      if (!rows.length) throw new Error('Invoice not found')
      if (!['open', 'in_progress'].includes(rows[0].status)) {
        throw new Error('Only open / in-progress invoices can be assigned')
      }
      await client.query(
        `UPDATE public.invoices
         SET status = 'in_progress',
             collection_assigned_to = $2,
             updated_at = now()
         WHERE id = $1`,
        [req.params.id, userId],
      )
    })
    res.json(snapshot)
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

/** User finished collection → admin must confirm paid */
app.post('/api/invoices/:id/request-paid', async (req, res) => {
  try {
    const { snapshot } = await withWrite(async (client) => {
      const { rows } = await client.query(
        `SELECT status FROM public.invoices WHERE id = $1`,
        [req.params.id],
      )
      if (!rows.length) throw new Error('Invoice not found')
      if (rows[0].status !== 'in_progress') {
        throw new Error('Invoice is not in progress')
      }
      await client.query(
        `UPDATE public.invoices
         SET status = 'awaiting_payment_confirm', updated_at = now()
         WHERE id = $1`,
        [req.params.id],
      )
    })
    res.json(snapshot)
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

/** Admin confirms payment → paid + receipt ledger */
app.post('/api/invoices/:id/confirm-paid', async (req, res) => {
  try {
    let partyId = null
    const { snapshot } = await withWrite(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM public.invoices WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!rows.length) throw new Error('Invoice not found')
      const inv = rows[0]
      if (
        inv.status !== 'awaiting_payment_confirm' &&
        inv.status !== 'in_progress' &&
        inv.status !== 'open'
      ) {
        throw new Error('Invoice cannot be marked paid from this status')
      }
      partyId = inv.party_id
      await client.query(
        `UPDATE public.invoices
         SET status = 'paid', updated_at = now()
         WHERE id = $1`,
        [inv.id],
      )
      await client.query(
        `INSERT INTO public.ledger_entries
          (id, party_id, entry_date, entry_type, voucher_no, particular, debit, credit, invoice_id)
         VALUES ($1,$2,CURRENT_DATE,'receipt',$3,'Payment received',0,$4,$5)`,
        [
          `led-paid-${Date.now()}`,
          inv.party_id,
          inv.bill_no,
          Number(inv.amount),
          inv.id,
        ],
      )
    })
    if (partyId) void touchPartyFolder(partyId)
    res.json(snapshot)
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) })
  }
})

app.get('/api/parties/:partyId/files', async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from) : null
    const to = req.query.to ? String(req.query.to) : null
    const params = [req.params.partyId]
    let sql = `SELECT * FROM public.party_files WHERE party_id = $1`
    if (from) {
      params.push(from)
      sql += ` AND file_date >= $${params.length}::date`
    }
    if (to) {
      params.push(to)
      sql += ` AND file_date <= $${params.length}::date`
    }
    sql += ` ORDER BY file_date DESC, created_at DESC`
    const { rows } = await pool.query(sql, params)
    res.json({ files: rows.map(mapPartyFile) })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/api/parties/:partyId/files',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Upload failed' })
        return
      }
      next()
    })
  },
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'file is required' })
        return
      }
      const partyId = req.params.partyId
      const partyCheck = await pool.query(
        `SELECT id FROM public.parties WHERE id = $1`,
        [partyId],
      )
      if (!partyCheck.rows.length) {
        fs.unlink(req.file.path, () => {})
        res.status(404).json({ error: 'Party not found — save the party first' })
        return
      }

      const title =
        String(req.body.title || '').trim() ||
        req.file.originalname ||
        'Untitled'
      const fileDate =
        String(req.body.fileDate || '').trim() ||
        new Date().toISOString().slice(0, 10)
      const id = `file-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
      const relPath = path.relative(PARTIES_ROOT, req.file.path)

      await pool.query(
        `INSERT INTO public.party_files
          (id, party_id, title, original_name, mime_type, kind, storage_path, file_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date)`,
        [
          id,
          partyId,
          title,
          req.file.originalname,
          req.file.mimetype,
          fileKind(req.file.mimetype),
          relPath.split(path.sep).join('/'),
          fileDate,
        ],
      )

      await touchPartyFolder(partyId)

      const { rows } = await pool.query(
        `SELECT * FROM public.party_files WHERE id = $1`,
        [id],
      )
      res.status(201).json({ file: mapPartyFile(rows[0]) })
    } catch (err) {
      if (req.file?.path) fs.unlink(req.file.path, () => {})
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/api/party-files/:id/content', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.party_files WHERE id = $1`,
      [req.params.id],
    )
    if (!rows.length) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    const row = rows[0]
    const abs = resolveUnderRoot(PARTIES_ROOT, row.storage_path)
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: 'File missing on disk' })
      return
    }
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(row.original_name || row.title || 'file').replace(/"/g, '')}"`,
    )
    fs.createReadStream(abs).pipe(res)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.delete('/api/party-files/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.party_files WHERE id = $1`,
      [req.params.id],
    )
    if (!rows.length) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    const row = rows[0]
    await pool.query(`DELETE FROM public.party_files WHERE id = $1`, [
      req.params.id,
    ])
    const abs = resolveUnderRoot(PARTIES_ROOT, row.storage_path)
    if (abs && fs.existsSync(abs)) {
      fs.unlinkSync(abs)
    }
    await touchPartyFolder(row.party_id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Replace all business data (used once to push local cache → server). Transactional. */
app.put('/api/snapshot', async (req, res) => {
  try {
    const { parties = [], invoices = [], ledger = [] } = req.body || {}
    const { snapshot } = await withWrite(async (client) => {
      await client.query('DELETE FROM public.ledger_entries')
      await client.query('DELETE FROM public.invoices')
      await client.query('DELETE FROM public.parties')
      for (const p of parties) {
        await client.query(
          `INSERT INTO public.parties
            (id, name, address, gstin, phone, credit_limit, photo, assigned_to, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)`,
          [
            p.id,
            p.name,
            p.address ?? null,
            p.gstin ?? null,
            p.phone ?? null,
            p.creditLimit ?? 50000,
            p.photo ?? null,
            p.assignedTo ?? null,
            p.createdAt ?? new Date().toISOString().slice(0, 10),
          ],
        )
      }
      for (const inv of invoices) {
        await client.query(
          `INSERT INTO public.invoices
            (id, party_id, bill_no, invoice_date, due_date, amount, status, pdf_name, notes, line_items, submitted_by, collection_assigned_to, created_at)
           VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::date)`,
          [
            inv.id,
            inv.partyId,
            inv.billNo ?? null,
            inv.invoiceDate,
            inv.dueDate,
            inv.amount,
            inv.status || 'open',
            inv.pdfName ?? null,
            inv.notes ?? null,
            JSON.stringify(inv.lineItems || []),
            inv.submittedBy ?? null,
            inv.collectionAssignedTo ?? null,
            inv.createdAt ?? new Date().toISOString().slice(0, 10),
          ],
        )
      }
      for (const e of ledger) {
        await client.query(
          `INSERT INTO public.ledger_entries
            (id, party_id, entry_date, entry_type, voucher_no, particular, debit, credit, invoice_id)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)`,
          [
            e.id,
            e.partyId,
            e.date,
            e.type,
            e.voucherNo ?? null,
            e.particular,
            Number(e.debit) || 0,
            Number(e.credit) || 0,
            e.invoiceId ?? null,
          ],
        )
      }
    })
    void syncAllPartyFolders(pool, PARTIES_ROOT).catch((err) =>
      console.warn('[party-folder] sync all', err.message || err),
    )
    res.json(snapshot)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const token =
    url.searchParams.get('token') ||
    String(req.headers['x-modi-token'] || '').trim()
  void (async () => {
    if (!(await isValidAccessToken(token))) {
      ws.close(1008, 'Unauthorized')
      return
    }
    sockets.add(ws)
    ws.on('close', () => sockets.delete(ws))
    try {
      const snapshot = await loadSnapshot(pool)
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'snapshot', ...snapshot }))
      }
    } catch {
      /* ignore */
    }
  })()
})

server.listen(PORT, HOST, () => {
  console.log(`MODI local DB API listening on http://${HOST}:${PORT}`)
  console.log('Postgres: local disk via DATABASE_URL (keep Postgres on 127.0.0.1)')
  console.log('Auth: local app_users (no Supabase)')
  console.log('Party backup folders:', PARTIES_ROOT)
  console.log('Live sync: ws://<server-ip>:' + PORT + '/ws?token=…')
  console.log('Health: GET /health (no auth)')
})

// Apply schema on boot (idempotent) so upgrades add local auth tables
const schemaPath = path.join(__dirname, 'schema.sql')
if (fs.existsSync(schemaPath)) {
  void pool
    .query(fs.readFileSync(schemaPath, 'utf8'))
    .then(async () => {
      console.log('Schema ensured')
      try {
        const n = await syncAllPartyFolders(pool, PARTIES_ROOT)
        console.log('Party backup folders synced:', n)
      } catch (err) {
        console.warn('Party folder sync warning:', err.message || err)
      }
    })
    .catch((err) => console.warn('Schema ensure warning:', err.message))
} else {
  console.warn('Warning: schema.sql missing next to server')
}

async function shutdown() {
  console.log('Shutting down — Postgres data remains on disk.')
  for (const ws of sockets) ws.close()
  server.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
