const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const {
  loadConfig,
  ensureOfficeServer,
  stopOfficeServer,
  completeOfficeSetup,
} = require('./office-server.cjs')
const { checkAndApplyPendingUpdate } = require('./apply-update.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow = null
let setupWindow = null
let officeCreds = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'MODI ELECTRICALS',
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    title: 'MODI Office Setup',
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setupWindow.loadFile(path.join(__dirname, 'setup.html'))
  setupWindow.on('closed', () => {
    setupWindow = null
  })
}

async function boot() {
  const skipOffice =
    process.env.MODI_SKIP_OFFICE_SERVER === '1' ||
    process.argv.includes('--client-only')

  if (skipOffice) {
    createMainWindow()
    return
  }

  const config = loadConfig()
  if (!config) {
    createSetupWindow()
    return
  }

  try {
    officeCreds = await ensureOfficeServer(config)
  } catch (err) {
    dialog.showErrorBox(
      'Office API failed to start',
      String(err?.message || err) +
        '\n\nYou can also run START-SERVER.bat from the MODI-Office folder.',
    )
  }
  createMainWindow()
}

app.whenReady().then(() => {
  if (checkAndApplyPendingUpdate()) {
    app.quit()
    return
  }

  void boot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot()
  })
})

app.on('window-all-closed', () => {
  // On Windows, leave the API running for other TSplus sessions.
  if (process.platform === 'darwin') {
    stopOfficeServer()
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (process.platform === 'darwin') stopOfficeServer()
})

ipcMain.handle('dialog:openPdf', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Scan invoice PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('office:getBootstrap', () => officeCreds)

ipcMain.handle('office:completeSetup', async (_event, payload) => {
  try {
    const result = await completeOfficeSetup(payload || {})
    officeCreds = {
      apiUrl: result.apiUrl,
      apiToken: result.apiToken,
    }
    if (setupWindow) {
      setupWindow.close()
      setupWindow = null
    }
    createMainWindow()
    return { ok: true, apiUrl: result.apiUrl, apiToken: result.apiToken }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
})
