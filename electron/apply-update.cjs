/**
 * Apply a dropped update pack from MODI-Office\updates\
 *
 * Preferred path: START-MODI.bat applies before launching (asar unlocked).
 * Fallback: if user opens the .exe directly, we schedule a helper after quit.
 */
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { app, dialog } = require('electron')

function officeRoot() {
  // resources/ is next to the .exe; updates/ lives beside the .exe
  return path.join(process.resourcesPath, '..')
}

function updatesDir() {
  return path.join(officeRoot(), 'updates')
}

function resourcesDir() {
  return process.resourcesPath
}

/** @returns {string | null} path to folder that contains app.asar and/or server/ */
function findUpdatePack() {
  const root = updatesDir()
  if (!fs.existsSync(root)) return null

  const directAsar = path.join(root, 'app.asar')
  const directServer = path.join(root, 'server', 'index.js')
  if (fs.existsSync(directAsar) || fs.existsSync(directServer)) {
    return root
  }

  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return null
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (ent.name === 'applied' || ent.name.startsWith('.')) continue
    const dir = path.join(root, ent.name)
    const asar = path.join(dir, 'app.asar')
    const server = path.join(dir, 'server', 'index.js')
    const manifest = path.join(dir, 'manifest.json')
    if (
      fs.existsSync(asar) ||
      fs.existsSync(server) ||
      fs.existsSync(manifest)
    ) {
      return dir
    }
  }
  return null
}

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyServerTree(srcServer, destServer) {
  fs.mkdirSync(destServer, { recursive: true })
  const skip = new Set(['.env', 'uploads'])
  const entries = fs.readdirSync(srcServer, { withFileTypes: true })
  for (const ent of entries) {
    if (skip.has(ent.name)) continue
    const from = path.join(srcServer, ent.name)
    const to = path.join(destServer, ent.name)
    if (ent.isDirectory()) {
      fs.cpSync(from, to, { recursive: true, force: true })
    } else {
      copyFileSafe(from, to)
    }
  }
}

/** Apply while nothing has the asar locked (e.g. from bat before start). */
function applyUpdatePackSync(packDir) {
  const res = resourcesDir()
  const asarSrc = path.join(packDir, 'app.asar')
  const serverSrc = path.join(packDir, 'server')
  let applied = []

  if (fs.existsSync(asarSrc)) {
    copyFileSafe(asarSrc, path.join(res, 'app.asar'))
    applied.push('app.asar')
  }
  if (fs.existsSync(path.join(serverSrc, 'index.js'))) {
    copyServerTree(serverSrc, path.join(res, 'server'))
    applied.push('server')
  }
  if (!applied.length) {
    throw new Error('Update pack has no app.asar or server/')
  }

  const appliedRoot = path.join(updatesDir(), 'applied')
  fs.mkdirSync(appliedRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(appliedRoot, stamp)
  try {
    fs.renameSync(packDir, dest)
  } catch {
    fs.cpSync(packDir, dest, { recursive: true })
    fs.rmSync(packDir, { recursive: true, force: true })
  }

  // If pack was the updates root itself (flat files), clear leftover files
  if (packDir === updatesDir()) {
    for (const name of ['app.asar', 'server', 'manifest.json', 'README-UPDATE.txt']) {
      const p = path.join(updatesDir(), name)
      fs.rmSync(p, { recursive: true, force: true })
    }
  }

  return applied
}

function writeDeferredApplyScript(packDir) {
  const root = officeRoot()
  const res = resourcesDir()
  const exeName = 'MODI ELECTRICALS.exe'
  const exePath = path.join(root, exeName)
  const scriptPath = path.join(root, 'updates', '_apply-pending.cmd')
  const pid = process.pid

  const lines = [
    '@echo off',
    'setlocal',
    `set "PACK=${packDir}"`,
    `set "RES=${res}"`,
    `set "EXE=${exePath}"`,
    `set "PID=${pid}"`,
    'echo Waiting for MODI to close...',
    ':wait',
    'tasklist /FI "PID eq %PID%" 2>NUL | find "%PID%" >NUL',
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >NUL',
    '  goto wait',
    ')',
    'timeout /t 1 /nobreak >NUL',
    'echo Applying update...',
    'if exist "%PACK%\\app.asar" copy /Y "%PACK%\\app.asar" "%RES%\\app.asar" >NUL',
    'if exist "%PACK%\\server\\index.js" (',
    '  robocopy "%PACK%\\server" "%RES%\\server" /E /XF .env /XD uploads >NUL',
    ')',
    'set "APPLIED=%~dp0applied"',
    'if not exist "%APPLIED%" mkdir "%APPLIED%"',
    'for /f %%i in (\'powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH-mm-ss"\') do set "STAMP=%%i"',
    'move "%PACK%" "%APPLIED%\\%STAMP%" >NUL 2>&1',
    'echo Starting MODI...',
    'start "" "%EXE%"',
    'del "%~f0" >NUL 2>&1',
  ]

  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8')
  return scriptPath
}

/**
 * If an update pack is present, schedule apply after quit and exit.
 * @returns {boolean} true if the app should stop booting (update scheduled)
 */
function checkAndApplyPendingUpdate() {
  if (process.env.VITE_DEV_SERVER_URL) return false
  if (!app.isPackaged && !process.env.MODI_FORCE_UPDATE_CHECK) return false

  const pack = findUpdatePack()
  if (!pack) return false

  let versionHint = ''
  try {
    const man = path.join(pack, 'manifest.json')
    if (fs.existsSync(man)) {
      const j = JSON.parse(fs.readFileSync(man, 'utf8'))
      if (j.version) versionHint = ` (v${j.version})`
    }
  } catch {
    /* ignore */
  }

  const result = dialog.showMessageBoxSync({
    type: 'info',
    buttons: ['Update & restart', 'Skip for now'],
    defaultId: 0,
    cancelId: 1,
    title: 'MODI update found',
    message: `An update pack was found in the updates folder${versionHint}.`,
    detail:
      'Postgres data will not be touched. The app will close, apply the update, then reopen.',
  })

  if (result !== 0) return false

  try {
    const script = writeDeferredApplyScript(pack)
    spawn('cmd.exe', ['/c', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: officeRoot(),
    }).unref()
  } catch (err) {
    dialog.showErrorBox(
      'Update failed to schedule',
      String(err?.message || err) +
        '\n\nQuit MODI and run START-MODI.bat so the update applies before launch.',
    )
    return false
  }

  return true
}

module.exports = {
  findUpdatePack,
  applyUpdatePackSync,
  checkAndApplyPendingUpdate,
  officeRoot,
  updatesDir,
}
