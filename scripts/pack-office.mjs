/**
 * Builds a complete transferable Windows office pack:
 *   release/MODI-Office/
 *     MODI ELECTRICALS.exe  (+ Electron runtime DLLs)
 *     resources/app.asar     (full UI)
 *     resources/server/      (API + node_modules + schema)
 *     resources/runtime/     (portable node.exe)
 *     README-TRANSFER.txt
 *     START-MODI.bat
 *
 * Postgres is NOT bundled — install PostgreSQL 17 on the PC first.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'release', 'MODI-Office')
const winUnpacked = path.join(root, 'release', 'win-unpacked')
const debugLog = path.join(root, '.cursor', 'debug-4750c9.log')
const nodeVersion = process.env.MODI_NODE_VERSION || '20.18.1'
const nodeZip = `node-v${nodeVersion}-win-x64.zip`
const nodeUrl = `https://nodejs.org/dist/v${nodeVersion}/${nodeZip}`

// #region agent log
function dlog(hypothesisId, location, message, data = {}) {
  const payload = {
    sessionId: '4750c9',
    runId: 'pack-full',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  }
  try {
    mkdirSync(path.dirname(debugLog), { recursive: true })
    appendFileSync(debugLog, JSON.stringify(payload) + '\n')
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7832/ingest/5bf6636c-1039-4fe3-a44a-3a90dd2d738a', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '4750c9',
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}
// #endregion

async function download(url, dest) {
  console.log('Downloading', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function run(cmd, opts = {}) {
  console.log('>', cmd)
  execSync(cmd, {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ...opts.env,
    },
    ...opts,
  })
}

function writeReadme(dir) {
  writeFileSync(
    path.join(dir, 'README-TRANSFER.txt'),
    `MODI ELECTRICALS — Complete office pack (UI + database API)
============================================================

BEFORE YOU START
1. Install PostgreSQL 17 on this Windows PC (already done if you followed setup).
2. Remember the postgres user password.

HOW TO RUN (whole software)
1. Copy this entire MODI-Office folder to the office PC (USB / shared drive).
2. Double-click START-MODI.bat  (or "MODI ELECTRICALS.exe").
3. First launch: enter the Postgres password when asked.
4. The app UI opens and the office database API starts automatically.
5. Keep the app available on this PC while the office works (TSplus sessions OK).

UPDATING LATER (no full reinstall)
1. On the build Mac: npm run pack:update
2. Copy the MODI-Update folder into this pack's updates\\ folder
   (so you have: MODI-Office\\updates\\MODI-Update\\...)
3. Quit MODI on the office PC, then start again (START-MODI.bat or .exe).
4. Confirm the update dialog (or START-MODI applies before launch).
5. Postgres data is never touched.

OTHER PCs / sessions connecting later
- Database page → API URL: http://<this-pc-lan-ip>:8787
- API token: same as configured on first setup (saved on this PC)

Firewall: allow inbound TCP 8787 on Private networks.
Postgres stays on localhost only — do not open 5432 to Wi-Fi.
`,
    'utf8',
  )
}

function writeLauncher(dir) {
  writeFileSync(
    path.join(dir, 'START-MODI.bat'),
    `@echo off
cd /d "%~dp0"

REM Apply dropped update pack before launch (asar not locked yet)
if exist "updates\\MODI-Update\\app.asar" goto APPLY
if exist "updates\\MODI-Update\\server\\index.js" goto APPLY
if exist "updates\\app.asar" goto APPLY_FLAT
goto LAUNCH

:APPLY
echo Applying MODI update from updates\\MODI-Update ...
if exist "updates\\MODI-Update\\app.asar" copy /Y "updates\\MODI-Update\\app.asar" "resources\\app.asar" >NUL
if exist "updates\\MODI-Update\\server\\index.js" (
  robocopy "updates\\MODI-Update\\server" "resources\\server" /E /XF .env /XD uploads >NUL
)
if not exist "updates\\applied" mkdir "updates\\applied"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH-mm-ss"') do set STAMP=%%i
move "updates\\MODI-Update" "updates\\applied\\%STAMP%" >NUL 2>&1
echo Update applied.
goto LAUNCH

:APPLY_FLAT
echo Applying MODI update from updates\\ ...
if exist "updates\\app.asar" copy /Y "updates\\app.asar" "resources\\app.asar" >NUL
if exist "updates\\server\\index.js" (
  robocopy "updates\\server" "resources\\server" /E /XF .env /XD uploads >NUL
)
if not exist "updates\\applied" mkdir "updates\\applied"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH-mm-ss"') do set STAMP=%%i
if exist "updates\\app.asar" move "updates\\app.asar" "updates\\applied\\app-%STAMP%.asar" >NUL 2>&1
if exist "updates\\server" move "updates\\server" "updates\\applied\\server-%STAMP%" >NUL 2>&1
if exist "updates\\manifest.json" move "updates\\manifest.json" "updates\\applied\\manifest-%STAMP%.json" >NUL 2>&1
echo Update applied.
goto LAUNCH

:LAUNCH
start "" "MODI ELECTRICALS.exe"
`,
    'utf8',
  )
}

function writeUpdatesPlaceholder(dir) {
  const updates = path.join(dir, 'updates')
  mkdirSync(updates, { recursive: true })
  writeFileSync(
    path.join(updates, 'README.txt'),
    `Drop a MODI-Update folder here, then restart MODI (prefer START-MODI.bat).

Expected:
  updates\\MODI-Update\\app.asar
  updates\\MODI-Update\\server\\
  updates\\MODI-Update\\manifest.json

Postgres data is never modified by updates.
`,
    'utf8',
  )
}

async function ensureWinNode(runtimeDir) {
  mkdirSync(runtimeDir, { recursive: true })
  const nodeExe = path.join(runtimeDir, 'node.exe')
  if (existsSync(nodeExe)) {
    console.log('Portable Node already present')
    return
  }
  const cache = path.join(root, '.cache')
  mkdirSync(cache, { recursive: true })
  const zipPath = path.join(cache, nodeZip)
  if (!existsSync(zipPath)) {
    await download(nodeUrl, zipPath)
  }
  const extractTo = path.join(
    tmpdir(),
    `modi-node-${createHash('md5').update(nodeVersion).digest('hex')}`,
  )
  rmSync(extractTo, { recursive: true, force: true })
  mkdirSync(extractTo, { recursive: true })
  run(`unzip -qo "${zipPath}" -d "${extractTo}"`)
  const extracted = path.join(extractTo, `node-v${nodeVersion}-win-x64`)
  cpSync(path.join(extracted, 'node.exe'), nodeExe)
  if (existsSync(path.join(extracted, 'LICENSE'))) {
    cpSync(path.join(extracted, 'LICENSE'), path.join(runtimeDir, 'NODE-LICENSE'))
  }
  rmSync(extractTo, { recursive: true, force: true })
}

function assertCompletePack(dir) {
  const checks = {
    exe: existsSync(path.join(dir, 'MODI ELECTRICALS.exe')),
    asar: existsSync(path.join(dir, 'resources', 'app.asar')),
    server: existsSync(path.join(dir, 'resources', 'server', 'index.js')),
    schema: existsSync(path.join(dir, 'resources', 'server', 'schema.sql')),
    ensureDb: existsSync(
      path.join(dir, 'resources', 'server', 'scripts', 'ensure-db.js'),
    ),
    serverModules: existsSync(
      path.join(dir, 'resources', 'server', 'node_modules', 'express'),
    ),
    nodeRuntime: existsSync(path.join(dir, 'resources', 'runtime', 'node.exe')),
    launcher: existsSync(path.join(dir, 'START-MODI.bat')),
  }
  // #region agent log
  dlog('H1', 'pack-office.mjs:assertCompletePack', 'pack completeness checks', checks)
  // #endregion
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
  if (missing.length) {
    throw new Error(`Incomplete pack — missing: ${missing.join(', ')}`)
  }
  console.log('Pack verified OK:', checks)
}

async function main() {
  // #region agent log
  dlog('H0', 'pack-office.mjs:main', 'pack start', { root, outDir })
  // #endregion

  const runtimeStaging = path.join(root, 'release', '_runtime-win')
  await ensureWinNode(runtimeStaging)

  console.log('Installing server dependencies…')
  run('npm --prefix server install --omit=dev')

  console.log('Building web UI…')
  run('npm run build')

  // #region agent log
  dlog('H2', 'pack-office.mjs:main', 'ui build done', {
    distIndex: existsSync(path.join(root, 'dist', 'index.html')),
    hasEnv: existsSync(path.join(root, '.env')),
  })
  // #endregion

  console.log('Building Windows Electron app (unpacked dir — no slow portable)…')
  rmSync(winUnpacked, { recursive: true, force: true })
  run('npx electron-builder --win dir --x64 --publish never')

  // #region agent log
  dlog('H3', 'pack-office.mjs:main', 'electron dir build done', {
    exe: existsSync(path.join(winUnpacked, 'MODI ELECTRICALS.exe')),
    asar: existsSync(path.join(winUnpacked, 'resources', 'app.asar')),
    serverWithoutModules: existsSync(
      path.join(winUnpacked, 'resources', 'server', 'index.js'),
    ),
    modulesAfterBuilder: existsSync(
      path.join(winUnpacked, 'resources', 'server', 'node_modules', 'express'),
    ),
  })
  // #endregion

  // electron-builder often skips node_modules via .gitignore — force-copy them.
  const destServer = path.join(winUnpacked, 'resources', 'server')
  console.log('Ensuring server node_modules inside resources…')
  cpSync(path.join(root, 'server', 'node_modules'), path.join(destServer, 'node_modules'), {
    recursive: true,
  })
  cpSync(path.join(root, 'server', 'scripts'), path.join(destServer, 'scripts'), {
    recursive: true,
  })
  cpSync(path.join(root, 'server', 'schema.sql'), path.join(destServer, 'schema.sql'))
  cpSync(path.join(root, 'server', 'index.js'), path.join(destServer, 'index.js'))
  for (const extra of ['auth-lib.js', 'party-folders.js']) {
    const src = path.join(root, 'server', extra)
    if (existsSync(src)) cpSync(src, path.join(destServer, extra))
  }

  const destRuntime = path.join(winUnpacked, 'resources', 'runtime')
  mkdirSync(destRuntime, { recursive: true })
  cpSync(path.join(runtimeStaging, 'node.exe'), path.join(destRuntime, 'node.exe'))

  console.log('Assembling MODI-Office transfer folder…')
  rmSync(outDir, { recursive: true, force: true })
  cpSync(winUnpacked, outDir, { recursive: true })
  writeReadme(outDir)
  writeLauncher(outDir)
  writeUpdatesPlaceholder(outDir)

  assertCompletePack(outDir)

  // #region agent log
  dlog('H4', 'pack-office.mjs:main', 'pack finished', { outDir })
  // #endregion

  console.log('\nDone:', outDir)
  console.log('Copy the whole MODI-Office folder to the office PC.')
  console.log('Run START-MODI.bat (or MODI ELECTRICALS.exe).')
}

main().catch((err) => {
  // #region agent log
  dlog('H5', 'pack-office.mjs:main', 'pack failed', {
    error: String(err?.message || err),
  })
  // #endregion
  console.error(err)
  process.exit(1)
})
