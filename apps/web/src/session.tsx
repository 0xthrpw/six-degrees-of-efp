import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api.ts'
import type { Card } from './types.ts'

interface SessionCtx {
  address: string | null
  profile: Card | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [profile, setProfile] = useState<Card | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const s = await api.siweMe()
      setAddress(s.address)
      setProfile(s.profile)
    } catch {
      setAddress(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await api.signout()
    setAddress(null)
    setProfile(null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <Ctx.Provider value={{ address, profile, loading, refresh, signOut }}>{children}</Ctx.Provider>
  )
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
