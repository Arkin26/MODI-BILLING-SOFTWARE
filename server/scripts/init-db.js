import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env')
  process.exit(1)
}

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8')
const client = new pg.Client({ connectionString: DATABASE_URL })

await client.connect()
try {
  await client.query(sql)
  console.log('Schema applied successfully to', DATABASE_URL.replace(/:[^:@]+@/, ':****@'))
} finally {
  await client.end()
}
