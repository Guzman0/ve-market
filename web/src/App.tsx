import { useState } from 'react'
import { AppProvider, useApp } from './state'
import { Market } from './components/Market'
import { Sell } from './components/Sell'
import { Activity } from './components/Activity'
import { ADDR, isMarketConfigured } from './lib/config'
import { explorerAddress, hasWallet } from './lib/chain'
import { errorText, fmtMusd, shortAddr } from './lib/format'

type View = 'market' | 'sell' | 'offers'

function Shell() {
  const { account, connect, musd, demo } = useApp()
  const [view, setView] = useState<View>('market')
  const [err, setErr] = useState('')

  return (
    <div className="wrap">
      {demo && (
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>Sample data.</strong> This preview shows made-up positions to review the layout. The live market reads real listings from Mezo testnet.
        </div>
      )}
      <header className="top">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Unlocked</div>
        <nav className="nav" aria-label="Main">
          <button aria-current={view === 'market' ? 'page' : undefined} onClick={() => setView('market')}>Market</button>
          <button aria-current={view === 'sell' ? 'page' : undefined} onClick={() => setView('sell')}>Sell</button>
          <button aria-current={view === 'offers' ? 'page' : undefined} onClick={() => setView('offers')}>My offers</button>
        </nav>
        <div className="top-right">
          <span className="net">Mezo Testnet</span>
          {account ? (
            <span className="btn quiet small" title={account}>
              {shortAddr(account)}{musd !== null ? `, ${fmtMusd(musd)}` : ''}
            </span>
          ) : (
            <button className="btn small" onClick={() => connect().catch((e) => setErr(errorText(e)))} disabled={!hasWallet() && !demo}>
              {hasWallet() ? 'Connect wallet' : 'No wallet found'}
            </button>
          )}
        </div>
      </header>
      {err && <div className="notice error" style={{ marginTop: 12 }}>{err}</div>}

      <main>
        {view === 'market' && <Market goSell={() => setView('sell')} />}
        {view === 'sell' && <Sell />}
        {view === 'offers' && <Activity />}
      </main>

      <footer className="foot">
        <span>Built on Mezo testnet. Payments in MUSD, Mezo's Bitcoin-backed dollar.</span>
        {isMarketConfigured && <a href={explorerAddress(ADDR.market)} target="_blank" rel="noreferrer">Market contract</a>}
        <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">Mezo app</a>
        <a href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">Testnet faucet</a>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
