import { useState } from 'react'
import { useApp } from '../state'
import type { Listing, Lock, Offer } from '../lib/data'
import { daysLeft, discount, lockValue, priceAtDiscount, returnToUnlock, tokens } from '../lib/metrics'
import { fmtDate, fmtMusd, fmtNum, fmtPct, fmtTokens, fmtUsd, shortAddr, toWei } from '../lib/format'
import { acceptOffer, listLock } from '../lib/actions'
import { ConnectPrompt, Drawer, Stat, Timeline, TxButton } from './ui'
import { EXPIRY_OPTIONS, ListingDrawer, expiryFrom } from './ListingDrawer'

const FEE_BPS = 100 // matches the deployed market's 1% fee

export function Sell() {
  const { account, myLocks, listings, offers, loading } = useApp()
  const [selling, setSelling] = useState<Lock | null>(null)
  const [managing, setManaging] = useState<Listing | null>(null)

  if (!account) {
    return (
      <>
        <Head />
        <ConnectPrompt what="see your locks" />
      </>
    )
  }

  const myListings = listings.filter((l) => l.seller.toLowerCase() === account.toLowerCase())
  const offersFor = (escrow: string, id: bigint) =>
    offers.filter((o) => o.active && o.tokenId === id && o.escrow.address.toLowerCase() === escrow.toLowerCase())

  return (
    <>
      <Head />

      <div className="group">
        <h2>Locks in your wallet</h2>
        {loading && myLocks.length === 0 && <p className="muted">Reading your locks</p>}
        {!loading && myLocks.length === 0 && (
          <div className="notice">
            This wallet has no veMEZO or veBTC locks. You can create one in the{' '}
            <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">Mezo app</a>.
          </div>
        )}
        <div className="list">
          {myLocks.map((lock) => (
            <LockRow key={`${lock.escrow.kind}-${lock.tokenId}`} lock={lock}
              offers={offersFor(lock.escrow.address, lock.tokenId)} onSell={() => setSelling(lock)} />
          ))}
        </div>
      </div>

      <div className="group">
        <h2>Your listings</h2>
        {myListings.length === 0 && <p className="muted">Nothing listed.</p>}
        <div className="list">
          {myListings.map((l) => (
            <div className="item" key={`${l.lock.escrow.kind}-${l.lock.tokenId}`}>
              <div className="meta">
                <strong>{l.lock.escrow.kind} #{l.lock.tokenId.toString()} for {fmtMusd(l.price)}</strong>
                <span className="pos-sub">
                  {offersFor(l.lock.escrow.address, l.lock.tokenId).length} offers
                  {l.expiresAt > 0n ? `, open until ${fmtDate(l.expiresAt)}` : ''}
                </span>
              </div>
              <button className="btn small ghost" onClick={() => setManaging(l)}>Manage</button>
            </div>
          ))}
        </div>
        {myListings.map((l) =>
          offersFor(l.lock.escrow.address, l.lock.tokenId).map((o) => (
            <OfferToAccept key={o.id.toString()} offer={o} lock={l.lock} listedByMe />
          )),
        )}
      </div>

      {selling && (
        <Drawer onClose={() => setSelling(null)}>
          <ListForm lock={selling} onDone={() => setSelling(null)} />
        </Drawer>
      )}
      {managing && <ListingDrawer listing={managing} onClose={() => setManaging(null)} />}
    </>
  )
}

function Head() {
  return (
    <div className="page-head">
      <h1>Sell a lock</h1>
      <p>
        List a veMEZO or veBTC position and get MUSD as soon as someone buys it. The position stays in the market
        contract while it is listed, so nobody can change it under a buyer, and you can cancel any time to take it back.
      </p>
    </div>
  )
}

function LockRow({ lock, offers, onSell }: { lock: Lock; offers: Offer[]; onSell: () => void }) {
  const { prices } = useApp()
  const value = lockValue(lock, prices)
  return (
    <div className="item">
      <div className="meta" style={{ minWidth: 180 }}>
        <strong>{lock.escrow.kind} #{lock.tokenId.toString()}</strong>
        <span className="pos-sub">{fmtTokens(lock.amount)} {lock.escrow.asset}, worth {fmtUsd(value)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}><Timeline lock={lock} /></div>
      {lock.transferable ? (
        <button className="btn small" onClick={onSell} disabled={lock.amount === 0n}>List for sale</button>
      ) : (
        <span className="pos-sub">In a managed pool, cannot be sold</span>
      )}
      {offers.map((o) => <OfferToAccept key={o.id.toString()} offer={o} lock={lock} listedByMe={false} />)}
    </div>
  )
}

function OfferToAccept({ offer, lock, listedByMe }: { offer: Offer; lock: Lock; listedByMe: boolean }) {
  const { account, wallet } = useApp()
  if (!account || !wallet) return null
  const fee = (offer.amount * BigInt(FEE_BPS)) / 10_000n
  return (
    <div className="callout" style={{ width: '100%' }}>
      <p style={{ marginBottom: 10 }}>
        <strong>{shortAddr(offer.buyer)}</strong> offers <strong>{fmtMusd(offer.amount)}</strong> for {lock.escrow.kind} #
        {lock.tokenId.toString()}. You would receive {fmtMusd(offer.amount - fee)} after the 1% fee.
        {offer.expiresAt > 0n && ` Open until ${fmtDate(offer.expiresAt)}.`}
      </p>
      <TxButton label="Accept offer" done="Sold. The MUSD is in your wallet."
        run={(step) => acceptOffer(wallet, account, offer, lock, listedByMe, step)} />
    </div>
  )
}

function ListForm({ lock, onDone }: { lock: Lock; onDone: () => void }) {
  const { account, wallet, prices } = useApp()
  const value = lockValue(lock, prices)
  const days = daysLeft(lock)
  const [disc, setDisc] = useState(0.15)
  const [manual, setManual] = useState<string>(value ? fmtNum(priceAtDiscount(value, 0.15), 2).replace(/,/g, '') : '')
  const [expiry, setExpiry] = useState(0)

  const priceNum = Number(manual.replace(/,/g, ''))
  const wei = toWei(manual)
  const fee = wei ? (wei * BigInt(FEE_BPS)) / 10_000n : 0n
  const realDisc = value && priceNum ? discount(priceNum, value) : null
  const buyerReturn = value && priceNum ? returnToUnlock(priceNum, value, days) : null

  function onSlide(d: number) {
    setDisc(d)
    if (value) setManual((Math.round(priceAtDiscount(value, d) * 100) / 100).toString())
  }

  if (!account || !wallet) return null
  return (
    <>
      <h2>List {lock.escrow.kind} #{lock.tokenId.toString()}</h2>
      <div className="section"><Timeline lock={lock} /></div>
      <div className="section stats">
        <Stat k="Locked" v={`${fmtTokens(lock.amount)} ${lock.escrow.asset}`} />
        <Stat k="Worth today" v={fmtUsd(value)} />
      </div>

      <div className="section">
        {value !== null && (
          <div className="field">
            <label htmlFor="disc">Discount to attract a buyer: {fmtPct(disc, 0)}</label>
            <input id="disc" type="range" min={0} max={0.6} step={0.01} value={disc} onChange={(e) => onSlide(Number(e.target.value))} />
          </div>
        )}
        <div className="field">
          <label htmlFor="price">Price</label>
          <div className="input-row">
            <input id="price" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0.00" />
            <span>MUSD</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="expiry">Listing open for</label>
          <div className="input-row">
            <select id="expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label === 'Until I withdraw it' ? 'Until I cancel it' : o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="sum"><span>Market fee (1%)</span><strong>{wei ? fmtMusd(fee) : 'n/a'}</strong></div>
        <div className="sum"><span>You receive when it sells</span><strong>{wei ? fmtMusd(wei - fee) : 'n/a'}</strong></div>
        {realDisc !== null && (
          <div className="sum">
            <span>Buyer's yearly return if they hold to unlock</span>
            <strong>{buyerReturn === null ? 'n/a' : fmtPct(buyerReturn)}</strong>
          </div>
        )}
        {realDisc !== null && realDisc < 0 && (
          <div className="notice" style={{ marginTop: 8 }}>This price is above what the locked tokens are worth today.</div>
        )}

        <div className="callout">
          <p>
            Listing takes two confirmations: one lets the market hold this position, the second lists it. While listed, the
            position cannot vote. Claim any rewards in the Mezo app before listing, because unclaimed rewards go to the buyer.
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <TxButton
            label={wei ? `List for ${fmtMusd(wei)}` : 'Enter a price'}
            disabled={!wei || wei === 0n}
            done="Listed. Buyers can see it in the market now."
            run={async (step) => {
              const h = await listLock(wallet, account, lock, wei!, expiryFrom(expiry), step)
              setTimeout(onDone, 1500)
              return h
            }}
          />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Value uses today's {lock.escrow.asset} price on Mezo ({fmtUsd(lock.escrow.asset === 'BTC' ? prices.BTC : prices.MEZO)}).
          {tokens(lock.votingPower) > 0 && ` The buyer also gets ${fmtTokens(lock.votingPower, 2)} voting power.`}
        </p>
      </div>
    </>
  )
}
