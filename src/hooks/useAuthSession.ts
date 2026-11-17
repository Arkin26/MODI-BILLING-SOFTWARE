import { useEffect, useState } from 'react'
import {
  fetchAllUsers,
  fetchMe,
  loadStoredSession,
  saveStoredSession,
  signOut,
} from '../lib/auth'
import { useAppStore } from '../store/useStore'
import type { User } from '../types'

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in'

export function useAuthSession() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const setUsers = useAppStore((s) => s.setUsers)
  const setCurrentUserId = useAppStore((s) => s.setCurrentUserId)
  const setAuthReady = useAppStore((s) => s.setAuthReady)
  const setDbFields = useAppStore((s) => s.setDbFields)
  const dbUrl = useAppStore((s) => s.dbUrl)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (useAppStore.getState().demoMode) {
        setStatus('signed_in')
        setAuthReady(true)
        return
      }

      const stored = loadStoredSession()
      if (!stored) {
        setCurrentUserId('')
        setStatus('signed_out')
        setAuthReady(true)
        return
      }

      const base = dbUrl.trim() || 'http://127.0.0.1:8787'
      setDbFields(base, stored.token)

      const me = (await fetchMe()) || stored.user
      if (cancelled) return
      if (!me) {
        saveStoredSession(null)
        setCurrentUserId('')
        setStatus('signed_out')
        setAuthReady(true)
        return
      }

      let team: User[] = [me]
      if (me.role === 'admin') {
        try {
          const all = await fetchAllUsers()
          if (all.length) team = all
        } catch {
          team = [me]
        }
      }

      if (cancelled) return
      setUsers(team)
      setCurrentUserId(me.id)
      setStatus('signed_in')
      setAuthReady(true)
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [dbUrl, setAuthReady, setCurrentUserId, setDbFields, setUsers])

  return { status, signOut }
}
