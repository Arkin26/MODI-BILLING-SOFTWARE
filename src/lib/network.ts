import { useEffect, useState } from 'react'

async function probeInternet(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  try {
    // Lightweight public endpoint; fails when offline / captive portal
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 4000)
    await fetch('https://www.gstatic.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    return true
  } catch {
    return typeof navigator !== 'undefined' ? navigator.onLine : false
  }
}

/** Tracks Wi‑Fi / network availability for remote DB connect. */
export function useNetworkStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine)
    }
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)

    setChecking(true)
    void probeInternet().then((ok) => {
      setOnline(ok)
      setChecking(false)
    })

    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  const recheck = async () => {
    setChecking(true)
    const ok = await probeInternet()
    setOnline(ok)
    setChecking(false)
    return ok
  }

  return { online, checking, recheck }
}

export async function requireOnline(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('No network connection. Connect to Wi‑Fi or ethernet, then try again.')
  }
  const ok = await probeInternet()
  if (!ok) {
    throw new Error('No internet access. Remote database needs an active network connection.')
  }
}
