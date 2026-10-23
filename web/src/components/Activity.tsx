import { useApp } from '../state'
import { fmtDate, fmtMusd } from '../lib/format'
import { cancelOffer } from '../lib/actions'
import { ConnectPrompt, TxButton } from './ui'

export function Activity() {
  const { account, wallet, offers, listings } = useApp()
  const head = (
    <div className="page-head">
      <h1>Your offers</h1>
      <p>Offers you have made on other people's locks. Your MUSD stays in the market contract until the seller accepts or you withdraw it.</p>
    </div>
  )
  if (!account || !wallet) return <>{head}<ConnectPrompt what="see your offers" /></>

  const mine = offers.filter((o) => o.buyer.toLowerCase() === account.toLowerCase())
  const active = mine.filter((o) => o.active)
  const closed = mine.filter((o) => !o.active)
  const isListed = (escrow: string, id: bigint) =>
    listings.some((l) => l.lock.tokenId === id && l.lock.escrow.address.toLowerCase() === escrow.toLowerCase())

  return (
    <>
      {head}
      <div className="group">
        <h2>Open</h2>
        {active.length === 0 && <p className="muted">No open offers. Find a position in the market and make one.</p>}
        <div className="list">
          {active.map((o) => {
            const expired = o.expiresAt > 0n && Number(o.expiresAt) * 1000 < Date.now()
            return (
              <div className="item" key={o.id.toString()}>
                <div className="meta">
                  <strong>{fmtMusd(o.amount)} for {o.escrow.kind} #{o.tokenId.toString()}</strong>
                  <span className="pos-sub">
                    {expired ? 'Expired, withdraw to get your MUSD back' : o.expiresAt > 0n ? `Open until ${fmtDate(o.expiresAt)}` : 'Open until you withdraw it'}
                    {isListed(o.escrow.address, o.tokenId) ? ', position is listed' : ', position is not listed'}
                  </span>
                </div>
                <div style={{ minWidth: 180 }}>
                  <TxButton label="Withdraw offer" variant="quiet small" done="Withdrawn. Your MUSD is back."
                    run={(step) => cancelOffer(wallet, account, o, step)} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {closed.length > 0 && (
        <div className="group">
          <h2>Closed</h2>
          <div className="list">
            {closed.map((o) => (
              <div className="item" key={o.id.toString()}>
                <div className="meta">
                  <strong>{fmtMusd(o.amount)} for {o.escrow.kind} #{o.tokenId.toString()}</strong>
                  <span className="pos-sub">Accepted or withdrawn</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
