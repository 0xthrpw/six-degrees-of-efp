import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionProvider } from 'ethereum-identity-kit'
import { BrowserRouter } from 'react-router-dom'
import 'ethereum-identity-kit/css'
import { wagmiConfig } from './wagmi.ts'
import { SessionProvider } from './session.tsx'
import { App } from './App.tsx'
import './styles.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TransactionProvider>
          <SessionProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </SessionProvider>
        </TransactionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
