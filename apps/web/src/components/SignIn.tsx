import { useState } from 'react'
import { useAccount, useConnect, useSignMessage } from 'wagmi'
import { api } from '../api.ts'
import { useSession } from '../session.tsx'
import { shortAddress } from './PersonCard.tsx'

/**
 * SIWE sign-in built on wagmi (connect → sign EIP-4361 message → backend verify).
 * The backend (`/api/siwe/nonce`, `/api/siwe/verify`) is identical to what
 * Ethereum Identity Kit's `SignInWithEthereum` expects, so that component can be
 * dropped in here later without backend changes.
 */
function buildSiweMessage(o: {
  domain: string
  address: string
  statement: string
  uri: string
  chainId: number
  nonce: string
  issuedAt: string
}): string {
  return [
    `${o.domain} wants you to sign in with your Ethereum account:`,
    o.address,
    '',
    o.statement,
    '',
    `URI: ${o.uri}`,
    'Version: 1',
    `Chain ID: ${o.chainId}`,
    `Nonce: ${o.nonce}`,
    `Issued At: ${o.issuedAt}`,
  ].join('\n')
}

export function SignIn() {
  const { address, profile, signOut, refresh } = useSession()
  const account = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (address) {
    return (
      <div className="auth">
        <span className="auth__who">{profile?.name ?? shortAddress(address)}</span>
        <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  const onSignIn = async () => {
    setErr(null)
    setBusy(true)
    try {
      let addr = account.address as string | undefined
      let chainId = account.chainId ?? 1
      if (!addr) {
        const connector = connectors[0]
        if (!connector) throw new Error('No wallet connector available')
        const result = await connectAsync({ connector })
        addr = result.accounts[0]
        chainId = result.chainId
      }
      if (!addr) throw new Error('No account connected')
      const { nonce } = await api.siweNonce()
      const message = buildSiweMessage({
        domain: window.location.host,
        address: addr,
        statement: 'Sign in to play Six Degrees of EFP.',
        uri: window.location.origin,
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      })
      const signature = await signMessageAsync({ message })
      await api.siweVerify({ message, signature })
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <button type="button" className="btn" disabled={busy} onClick={() => void onSignIn()}>
        {busy ? 'Signing in…' : 'Sign in with Ethereum'}
      </button>
      {err && <span className="auth__err">{err}</span>}
    </div>
  )
}
