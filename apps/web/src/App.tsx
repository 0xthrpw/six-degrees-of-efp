import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { SignIn } from './components/SignIn.tsx'
import { Home } from './pages/Home.tsx'
import { Play } from './pages/Play.tsx'

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Six Degrees of <span className="brand__accent">EFP</span>
        </Link>
        <SignIn />
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/:mode" element={<Play />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        Connect anyone to anyone through the{' '}
        <a href="https://efp.app" target="_blank" rel="noreferrer">
          Ethereum Follow Protocol
        </a>{' '}
        graph.
      </footer>
    </div>
  )
}
