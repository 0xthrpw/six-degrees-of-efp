import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: projectId
    ? [injected(), walletConnect({ projectId, showQrModal: true })]
    : [injected()],
  transports: { [mainnet.id]: http() },
})
