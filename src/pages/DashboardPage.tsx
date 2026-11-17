import { AlertBanner } from '../components/dashboard/AlertBanner'
import { OverviewCards } from '../components/dashboard/OverviewCards'
import { UsersPanel } from '../components/dashboard/UsersPanel'
import { WorkflowPanel } from '../components/dashboard/WorkflowPanel'
import { PartiesTable } from '../components/parties/PartiesTable'
import { useCurrentUser } from '../hooks/useAppData'

export function DashboardPage() {
  const user = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="space-y-5">
      <AlertBanner />
      <WorkflowPanel />
      <div>
        <h2 className="font-display text-lg font-semibold">
          Overview
          <span className="ml-2 text-sm font-normal text-zinc-500">
            —{' '}
            {isAdmin
              ? 'all parties'
              : `${user?.name ?? 'User'}'s parties`}
          </span>
        </h2>
      </div>
      <OverviewCards />
      <PartiesTable />
      {isAdmin && (
        <div className="space-y-3 pt-2">
          <h2 className="font-display text-lg font-semibold">User access</h2>
          <p className="text-sm text-zinc-500">
            Create login credentials for staff. They must use these to open the
            app — random downloads cannot see data without an account.
          </p>
          <UsersPanel />
        </div>
      )}
    </div>
  )
}
