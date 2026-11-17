import crypto from 'node:crypto'

const SESSION_DAYS = 30

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const next = crypto.scryptSync(String(password), salt, 64).toString('hex')
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(next, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function newUserId() {
  return `user_${crypto.randomBytes(12).toString('hex')}`
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function usernameToEmail(username) {
  const trimmed = String(username || '').trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  return `${trimmed.toLowerCase()}@local.modi`
}

export function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
  }
}

export function sessionExpiryDate() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
}

export async function countUsers(pool) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM public.app_users`)
  return Number(rows[0]?.n || 0)
}

export async function findUserByUsername(pool, username) {
  const { rows } = await pool.query(
    `SELECT * FROM public.app_users WHERE lower(username) = lower($1) LIMIT 1`,
    [String(username || '').trim()],
  )
  return rows[0] || null
}

export async function findUserById(pool, id) {
  const { rows } = await pool.query(
    `SELECT * FROM public.app_users WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

export async function createUser(pool, { username, password, name, role }) {
  const id = newUserId()
  const email = usernameToEmail(username)
  const passwordHash = hashPassword(password)
  const { rows } = await pool.query(
    `INSERT INTO public.app_users (id, username, name, email, role, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, username, name, email, role`,
    [id, String(username).trim(), String(name).trim(), email, role, passwordHash],
  )
  return mapUserRow(rows[0])
}

export async function createSession(pool, userId) {
  const token = newSessionToken()
  const expiresAt = sessionExpiryDate()
  await pool.query(
    `INSERT INTO public.auth_sessions (token, user_id, expires_at)
     VALUES ($1,$2,$3)`,
    [token, userId, expiresAt.toISOString()],
  )
  return { token, expiresAt }
}

export async function deleteSession(pool, token) {
  await pool.query(`DELETE FROM public.auth_sessions WHERE token = $1`, [token])
}

export async function resolveSession(pool, token) {
  if (!token) return null
  const { rows } = await pool.query(
    `SELECT s.token, s.expires_at, u.id, u.username, u.name, u.email, u.role
     FROM public.auth_sessions s
     JOIN public.app_users u ON u.id = s.user_id
     WHERE s.token = $1
     LIMIT 1`,
    [token],
  )
  const row = rows[0]
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await deleteSession(pool, token)
    return null
  }
  return {
    token: row.token,
    user: mapUserRow(row),
  }
}

export async function listUsers(pool) {
  const { rows } = await pool.query(
    `SELECT id, username, name, email, role
     FROM public.app_users
     ORDER BY created_at ASC`,
  )
  return rows.map(mapUserRow)
}

export async function ensureBootstrapAdmin(pool, {
  username = 'admin',
  password,
  name = 'Administrator',
} = {}) {
  const n = await countUsers(pool)
  if (n > 0) return { created: false, user: null }
  if (!password || String(password).length < 8) {
    throw new Error('Bootstrap admin password must be at least 8 characters')
  }
  const user = await createUser(pool, {
    username,
    password,
    name,
    role: 'admin',
  })
  return { created: true, user }
}
