import { useState, type ReactNode } from 'react'
import type { Lock } from '../lib/data'
import { daysLeft } from '../lib/metrics'
import { fmtDate, fmtDays, errorText } from '../lib/format'
import { explorerTx } from '../lib/chain'
import { useApp } from '../state'

/** How much of the lock is still ahead, against the longest possible lock for that asset. */
export function Timeline({ lock }: { lock: Lock }) {
  const days = daysLeft(lock)
  const share = days === null ? 1 : Math.min(1, days / lock.escrow.maxLockDays)
  return (
    <div className="timeline">
      <div
        className="timeline-track"
        role="img"
        aria-label={days === null ? 'Permanent lock' : `${fmtDays(days)} until unlock`}
      >
        <div className="timeline-fill" style={{ width: `${Math.max(share * 100, days && days > 0 ? 3 : 0)}%` }} />
      </div>
      <div className="timeline-label">
        <strong>{days === null ? 'Permanent' : days < 1 ? 'Unlocked' : `${fmtDays(days)} left`}</strong>
        <span>{lock.isPermanent ? 'No end date' : fmtDate(lock.end)}</span>
      </div>
    </div>
  )
}

export function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
    </div>
  )
}

/**
 * A button that runs a wallet flow, shows each step as it happens and the final transaction
 * link, and turns errors into a plain sentence.
 */
export function TxButton({
  label, run, disabled, variant = '', done,
}: {
  label: string
  run: (step: (s: string) => void) => Promise<string | void>
  disabled?: boolean
  variant?: string
  done?: string
}) {
  const { refresh, demo } = useApp()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [hash, setHash] = useState<string>('')

  async function go() {
    setBusy(true); setError(''); setHash(''); setStatus('')
    try {
      if (demo) throw new Error('This is sample data. Open the page without ?demo to use the live market.')
      const h = await run(setStatus)
      if (h) setHash(h)
      setStatus(done ?? 'Done.')
      await refresh()
    } catch (e) {
      setStatus('')
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button className={`btn wide ${variant}`} onClick={go} disabled={disabled || busy}>
        {busy ? 'Working' : label}
      </button>
      <div className="progress" aria-live="polite">
        {error ? <span className="bad">{error}</span> : status}
        {hash && <a href={explorerTx(hash)} target="_blank" rel="noreferrer">View transaction</a>}
      </div>
    </div>
  )
}

export function ConnectPrompt({ what }: { what: string }) {
  const { connect } = useApp()
  const [err, setErr] = useState('')
  return (
    <div className="empty">
      <h3>Connect a wallet to {what}</h3>
      <p>Use MetaMask or Rabby. The app will add Mezo Testnet to your wallet if it is not there yet.</p>
      <button className="btn" onClick={() => connect().catch((e) => setErr(errorText(e)))}>Connect wallet</button>
      {err && <p className="bad">{err}</p>}
    </div>
  )
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <button className="btn quiet small drawer-close" onClick={onClose}>Close</button>
        {children}
      </aside>
    </>
  )
}
