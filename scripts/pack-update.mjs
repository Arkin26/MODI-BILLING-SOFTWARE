/**
 * Small update pack for an existing MODI-Office install.
 * Drop release/MODI-Update into MODI-Office/updates/ then restart.
 */
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'release', 'MODI-Update')
const winUnpacked = path.join(root, 'release', 'win-unpacked')

function run(cmd) {
  console.log('>', cmd)
  execSync(cmd, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  })
}

const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version

console.log('Building update pack', version)
run('npm --prefix server install --omit=dev')
run('npm run build')
run('npx electron-builder --win dir --x64 --publish never')

const asarSrc = path.join(winUnpacked, 'resources', 'app.asar')
if (!existsSync(asarSrc)) throw new Error('app.asar missing')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
cpSync(asarSrc, path.join(outDir, 'app.asar'))

const serverOut = path.join(outDir, 'server')
mkdirSync(serverOut, { recursive: true })
for (const name of [
  'index.js',
  'auth-lib.js',
  'party-folders.js',
  'schema.sql',
  'package.json',
  'package-lock.json',
  'scripts',
  'node_modules',
]) {
  const src = path.join(root, 'server', name)
  if (existsSync(src)) cpSync(src, path.join(serverOut, name), { recursive: true })
}

writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      name: 'modi-electricals',
      version,
      createdAt: new Date().toISOString(),
      files: ['app.asar', 'server'],
    },
    null,
    2,
  ),
)

writeFileSync(
  path.join(outDir, 'README-UPDATE.txt'),
  `MODI update v${version}
====================

ON THE OFFICE PC
1. Quit MODI completely (all TSplus sessions).
2. Copy THIS whole folder into:
     MODI-Office\\updates\\MODI-Update
   (result: MODI-Office\\updates\\MODI-Update\\app.asar etc.)
3. Start with START-MODI.bat (best) or MODI ELECTRICALS.exe
4. Confirm update if asked.

Postgres / party data is NOT touched.
server\\.env on the PC is preserved.
`,
)

console.log('Done:', outDir)
