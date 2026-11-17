import { useAppStore } from './store/useStore'
import { useCurrentUser } from './hooks/useAppData'
import { useAuthSession } from './hooks/useAuthSession'
import { useDbBootstrap } from './hooks/useDbBootstrap'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { PartiesPage } from './pages/PartiesPage'
import { PartyDetailPage } from './pages/PartyDetailPage'
import { ScanPage } from './pages/ScanPage'
import { DatabasePage } from './pages/DatabasePage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  const { status } = useAuthSession()
  useDbBootstrap()
  const page = useAppStore((s) => s.page)
  const authReady = useAppStore((s) => s.authReady)
  const currentUser = useCurrentUser()

  if (!authReady || status === 'loading') {
    return (
      <div className="flex h-full min-h-[100dvh] items-center justify-center bg-[var(--modi-bg)] text-sm text-zinc-500">
        Checking session…
      </div>
    )
  }

  if (!currentUser) {
    return <LoginPage />
  }

  let content = <DashboardPage />
  if (page === 'parties') content = <PartiesPage />
  if (page === 'party') content = <PartyDetailPage />
  if (page === 'scan') {
    content = <ScanPage />
  }
  if (page === 'database') content = <DatabasePage />

  return <AppShell>{content}</AppShell>
}
