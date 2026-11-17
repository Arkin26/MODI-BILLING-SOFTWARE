import { toWsUrl, type DbSnapshot } from './api'

type SnapshotHandler = (snapshot: DbSnapshot) => void
type StatusHandler = (status: 'connecting' | 'open' | 'closed' | 'error') => void

let socket: WebSocket | null = null
let intentionalClose = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let lastUrl = ''
let onSnapshot: SnapshotHandler | null = null
let onStatus: StatusHandler | null = null

export function setLiveSyncHandlers(
  snapshotHandler: SnapshotHandler,
  statusHandler?: StatusHandler,
) {
  onSnapshot = snapshotHandler
  onStatus = statusHandler ?? null
}

export function connectLiveSync(baseUrl: string, token: string) {
  disconnectLiveSync()
  intentionalClose = false
  lastUrl = toWsUrl(baseUrl, token)
  openSocket()
}

function openSocket() {
  if (!lastUrl) return
  onStatus?.('connecting')
  try {
    socket = new WebSocket(lastUrl)
  } catch {
    onStatus?.('error')
    scheduleReconnect()
    return
  }

  socket.onopen = () => onStatus?.('open')
  socket.onerror = () => onStatus?.('error')
  socket.onclose = () => {
    onStatus?.('closed')
    socket = null
    if (!intentionalClose) scheduleReconnect()
  }
  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as DbSnapshot & {
        type?: string
      }
      if (data.type === 'snapshot' || (data.parties && data.invoices)) {
        onSnapshot?.({
          revision: data.revision,
          parties: data.parties,
          invoices: data.invoices,
          ledger: data.ledger,
        })
      }
    } catch {
      /* ignore malformed */
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    if (!intentionalClose) openSocket()
  }, 2000)
}

export function disconnectLiveSync() {
  intentionalClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
  lastUrl = ''
  onStatus?.('closed')
}
