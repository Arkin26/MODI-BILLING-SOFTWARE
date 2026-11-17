/**
 * Creates database modi_electricals if missing, then applies schema.sql.
 * Usage: node scripts/ensure-db.js
 * Requires DATABASE_URL in server/.env
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env')
  process.exit(1)
}

const dbName = process.env.MODI_DB_NAME || 'modi_electricals'
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
  console.error('Invalid MODI_DB_NAME')
  process.exit(1)
}

function adminUrl(url) {
  const u = new URL(url)
  u.pathname = '/postgres'
  return u.toString()
}

const admin = new pg.Client({ connectionString: adminUrl(DATABASE_URL) })
await admin.connect()
try {
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  )
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`)
    console.log('Created database', dbName)
  } else {
    console.log('Database already exists:', dbName)
  }
} finally {
  await admin.end()
}

const sql = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()
try {
  await client.query(sql)
  console.log('Schema applied successfully')

  const adminUser = process.env.MODI_ADMIN_USERNAME || 'admin'
  const adminPass = process.env.MODI_ADMIN_PASSWORD || ''
  const adminName = process.env.MODI_ADMIN_NAME || 'Administrator'
  if (adminPass) {
    const { ensureBootstrapAdmin } = await import('../auth-lib.js')
    const result = await ensureBootstrapAdmin(client, {
      username: adminUser,
      password: adminPass,
      name: adminName,
    })
    if (result.created) {
      console.log('Created local admin user:', adminUser)
    } else {
      console.log('Local admin already exists — skipped bootstrap')
    }
  } else {
    console.log('No MODI_ADMIN_PASSWORD set — create admin via /api/auth/bootstrap')
  }
} finally {
  await client.end()
}
