const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const { app } = require('electron')

function packRoot() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.join(__dirname, '..')
}

function serverDir() {
  return path.join(packRoot(), 'server')
}

function nodeBinary() {
  const root = packRoot()
  if (process.platform === 'win32') {
    const bundled = path.join(root, 'runtime', 'node.exe')
    if (fs.existsSync(bundled)) return bundled
  } else {
    const bundled = path.join(root, 'runtime', 'bin', 'node')
    if (fs.existsSync(bundled)) return bundled
  }
  return process.env.MODI_NODE || 'node'
}

function configPath() {
  return path.join(app.getPath('userData'), 'office-config.json')
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
}

function writeServerEnv(config) {
  const uploads = path.join(app.getPath('userData'), 'parties')
  fs.mkdirSync(uploads, { recursive: true })
  const envPath = path.join(serverDir(), '.env')
  const lines = [
    `DATABASE_URL=${config.databaseUrl}`,
    `PORT=${config.port}`,
    `HOST=0.0.0.0`,
    `MODI_API_TOKEN=${config.apiToken}`,
    `MODI_PARTIES_DIR=${uploads.replace(/\\/g, '/')}`,
    `MODI_UPLOADS_DIR=${uploads.replace(/\\/g, '/')}`,
  ]
  if (config.adminUsername) {
    lines.push(`MODI_ADMIN_USERNAME=${config.adminUsername}`)
  }
  if (config.adminPassword) {
    lines.push(`MODI_ADMIN_PASSWORD=${config.adminPassword}`)
  }
  if (config.adminName) {
    lines.push(`MODI_ADMIN_NAME=${config.adminName}`)
  }
  lines.push('')
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
  return envPath
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBinary(), args, {
      cwd: serverDir(),
      env: { ...process.env },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else
        reject(
          new Error(
            (stderr || stdout || `Command failed (${code})`).trim().slice(0, 800),
          ),
        )
    })
  })
}

function healthCheck(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/health`,
      { timeout: timeoutMs },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

let serverChild = null
let weStartedServer = false

function stopOfficeServer() {
  if (!serverChild || !weStartedServer) return
  try {
    serverChild.kill()
  } catch {
    /* ignore */
  }
  serverChild = null
  weStartedServer = false
}

async function ensureOfficeServer(config) {
  writeServerEnv(config)
  const port = Number(config.port) || 8787
  if (await healthCheck(port)) {
    return {
      apiUrl: `http://127.0.0.1:${port}`,
      apiToken: config.apiToken,
      alreadyRunning: true,
    }
  }

  serverChild = spawn(nodeBinary(), ['index.js'], {
    cwd: serverDir(),
    env: { ...process.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform === 'win32',
  })
  weStartedServer = true
  serverChild.stdout.on('data', (d) => {
    console.log('[office-api]', d.toString().trim())
  })
  serverChild.stderr.on('data', (d) => {
    console.error('[office-api]', d.toString().trim())
  })
  serverChild.on('exit', (code) => {
    console.log('[office-api] exited', code)
    serverChild = null
    weStartedServer = false
  })
  if (process.platform === 'win32') {
    serverChild.unref()
  }

  for (let i = 0; i < 25; i++) {
    if (await healthCheck(port)) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return {
    apiUrl: `http://127.0.0.1:${port}`,
    apiToken: config.apiToken,
    alreadyRunning: false,
  }
}

async function completeOfficeSetup({
  password,
  port = 8787,
  adminUsername = 'admin',
  adminPassword,
  adminName = 'Administrator',
}) {
  const apiToken = crypto.randomBytes(32).toString('hex')
  const databaseUrl = `postgresql://postgres:${encodeURIComponent(String(password))}@127.0.0.1:5432/modi_electricals`
  const config = {
    databaseUrl,
    apiToken,
    port: Number(port) || 8787,
    adminUsername: String(adminUsername || 'admin').trim() || 'admin',
    adminPassword: String(adminPassword || password),
    adminName: String(adminName || 'Administrator').trim() || 'Administrator',
    createdAt: new Date().toISOString(),
  }

  writeServerEnv(config)
  await runNode(['scripts/ensure-db.js'])
  saveConfig(config)
  const started = await ensureOfficeServer(config)
  return { ok: true, ...started, config }
}

module.exports = {
  loadConfig,
  saveConfig,
  ensureOfficeServer,
  stopOfficeServer,
  completeOfficeSetup,
  serverDir,
  nodeBinary,
  configPath,
  healthCheck,
}
