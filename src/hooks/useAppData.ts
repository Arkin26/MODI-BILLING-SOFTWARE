import { useMemo } from 'react'
import { useAppStore } from '../store/useStore'
import { partyBalance, sortByClosestDueDate } from '../lib/dates'
import type { Invoice, Party, User } from '../types'

export function useCurrentUser(): User | null {
  const users = useAppStore((s) => s.users)
  const currentUserId = useAppStore((s) => s.currentUserId)
  return users.find((u) => u.id === currentUserId) ?? null
}

export function useVisibleParties(): Party[] {
  const parties = useAppStore((s) => s.parties)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const search = useAppStore((s) => s.search)
  const users = useAppStore((s) => s.users)
  const user = users.find((u) => u.id === currentUserId) ?? null

  return useMemo(() => {
    let list =
      user?.role === 'admin'
        ? parties
        : parties.filter((p) => p.assignedTo === currentUserId)

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.gstin?.toLowerCase().includes(q) ||
          p.phone?.includes(q),
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [parties, currentUserId, search, user?.role])
}

export function useVisibleInvoices(): Invoice[] {
  const invoices = useAppStore((s) => s.invoices)
  const parties = useVisibleParties()
  const partyIds = useMemo(() => new Set(parties.map((p) => p.id)), [parties])
  const search = useAppStore((s) => s.search)

  return useMemo(() => {
    let list = invoices.filter((inv) => partyIds.has(inv.partyId))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (inv) =>
          inv.billNo?.toLowerCase().includes(q) ||
          inv.id.toLowerCase().includes(q) ||
          String(inv.amount).includes(q),
      )
    }
    return sortByClosestDueDate(list)
  }, [invoices, partyIds, search])
}

export function useUnreadCount(): number {
  const notifications = useAppStore((s) => s.notifications)
  return useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )
}

export function usePartyBalance(partyId: string): number {
  const ledger = useAppStore((s) => s.ledger)
  return useMemo(
    () => partyBalance(ledger.filter((e) => e.partyId === partyId)),
    [ledger, partyId],
  )
}
