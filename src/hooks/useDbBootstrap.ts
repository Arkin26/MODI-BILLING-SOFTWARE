import { useEffect } from 'react'
import { useAppStore } from '../store/useStore'

/** Apply Electron office-server credentials, then reconnect using saved URL/token. */
export function useDbBootstrap() {
  const bootstrap = useAppStore((s) => s.bootstrapDbFromSavedSettings)
  const setDbFields = useAppStore((s) => s.setDbFields)
  const authReady = useAppStore((s) => s.authReady)
  const currentUserId = useAppStore((s) => s.currentUserId)

  useEffect(() => {
    if (!authReady || !currentUserId) return
    if (useAppStore.getState().demoMode) return

    let cancelled = false
    ;(async () => {
      const desktop = window.modiDesktop
      if (desktop?.getOfficeBootstrap) {
        const fromIpc = await desktop.getOfficeBootstrap()
        if (
          !cancelled &&
          fromIpc?.apiUrl?.trim() &&
          fromIpc?.apiToken?.trim()
        ) {
          setDbFields(fromIpc.apiUrl.trim(), fromIpc.apiToken.trim())
        }
      } else if (
        desktop?.officeBootstrap?.apiUrl?.trim() &&
        desktop?.officeBootstrap?.apiToken?.trim()
      ) {
        setDbFields(
          desktop.officeBootstrap.apiUrl.trim(),
          desktop.officeBootstrap.apiToken.trim(),
        )
      }
      if (!cancelled) await bootstrap()
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, currentUserId, bootstrap, setDbFields])
}
