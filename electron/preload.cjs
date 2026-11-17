const { contextBridge, ipcRenderer } = require('electron')

function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : ''
}

contextBridge.exposeInMainWorld('modiDesktop', {
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),
  isElectron: true,
  officeBootstrap: {
    apiUrl: readArg('--modi-api-url='),
    apiToken: readArg('--modi-api-token='),
  },
  getOfficeBootstrap: () => ipcRenderer.invoke('office:getBootstrap'),
  completeOfficeSetup: (payload) =>
    ipcRenderer.invoke('office:completeSetup', payload),
})
