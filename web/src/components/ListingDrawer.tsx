import { useState } from 'react'
import { useApp } from '../state'
import type { Listing } from '../lib/data'
import { daysLeft, discount, lockValue, returnToUnlock, tokens } from '../lib/metrics'
import { fmtDate, fmtMusd, fmtPct, fmtTokens, fmtUsd, shortAddr, toWei } from '../lib/format'
import { buyListing, cancelListing, cancelOffer, makeOffer, updateListing } from '../lib/actions'
import { explorerAddress } from '../lib/chain'
import { ConnectPrompt, Drawer, Stat, Timeline, TxButton } from './ui'

const EXPIRY_OPTIONS = [
  { label: 'Until I withdraw it', days: 0 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]

function expiryFrom(days: number) {
  return days === 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + days * 86400)
}

export function ListingDrawer({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const { account, wallet, prices, offers, musd } = useApp()
  const { lock } = listing
  const value = lockValue(lock, prices)
  const price = tokens(listing.price)
  const days = daysLeft(lock)
  const disc = discount(price, value)
  const ret = returnToUnlock(price, value, days)
  const mine = account?.toLowerCase() === listing.seller.toLowerCase()
  const positionOffers = offers.filter(
    (o) => o.active && o.tokenId === lock.tokenId && o.escrow.address === lock.escrow.address,
  )
  const short = musd !== null && musd < listing.price

  return (
    <Drawer onClose={onClose}>
      <h2>{lock.escrow.kind} #{lock.tokenId.toString()}</h2>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Listed by <a href={explorerAddress(listing.seller)} target="_blank" rel="noreferrer">{mine ? 'you' : shortAddr(listing.seller)}</a>
        {listing.expiresAt > 0n && `, open until ${fmtDate(listing.expiresAt)}`}
      </p>

      <div className="section">
        <Timeline lock={lock} />
      </div>

      <div className="section stats">
        <Stat k="Locked" v={`${fmtTokens(lock.amount)} ${lock.escrow.asset}`} />
        <Stat k="Worth today" v={fmtUsd(value)} />
        <Stat k="Price" v={fmtMusd(listing.price)} />
        <Stat
          k="Discount"
          v={disc === null ? 'n/a' : disc >= 0 ? `${fmtPct(disc)} off` : `${fmtPct(-disc)} over value`}
          tone={disc === null ? undefined : disc > 0 ? 'good' : 'bad'}
        />
        <Stat k="Voting power" v={fmtTokens(lock.votingPower, 2)} />
        <Stat k="Yearly return to unlock" v={ret === null ? 'n/a' : fmtPct(ret)} />
      </div>

      {value !== null && disc !== null && days !== null && days >= 1 && (
        <div className="callout">
          <p>
            Pay <strong>{fmtMusd(listing.price)}</strong> now and hold {fmtTokens(lock.amount)} {lock.escrow.asset} worth{' '}
            <strong>{fmtUsd(value)}</strong> at today's price when the lock ends on {fmtDate(lock.end)}. Until then you
            hold its voting power and can direct Mezo Earn rewards with it.
          </p>
        </div>
      )}

      {!account && <ConnectPrompt what="buy or make an offer" />}

      {account && wallet && mine && <ManageListing listing={listing} />}

      {account && wallet && !mine && (
        <>
          <div className="section">
            <h3>Buy now</h3>
            <div className="sum"><span>You pay</span><strong>{fmtMusd(listing.price)}</strong></div>
            <div className="sum"><span>Your MUSD balance</span><strong>{musd === null ? 'n/a' : fmtMusd(musd)}</strong></div>
            {short && (
              <div className="notice" style={{ margin: '8px 0' }}>
                You need {fmtMusd(listing.price - (musd ?? 0n))} more. You can borrow MUSD against your BTC in the{' '}
                <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">Mezo app</a>.
              </div>
            )}
            <TxButton
              label={`Buy for ${fmtMusd(listing.price)}`}
              disabled={short}
              done="Bought. The position is now in your wallet."
              run={(step) => buyListing(wallet, account, listing, step)}
            />
          </div>
          <OfferForm listing={listing} />
        </>
      )}

      <div className="section">
        <h3>Offers on this position</h3>
        {positionOffers.length === 0 && <p className="muted" style={{ margin: 0 }}>No offers yet.</p>}
        <div className="list">
          {positionOffers.map((o) => (
            <div className="item" key={o.id.toString()}>
              <div className="meta">
                <strong>{fmtMusd(o.amount)}</strong>
                <span className="pos-sub">
                  from {o.buyer.toLowerCase() === account?.toLowerCase() ? 'you' : shortAddr(o.buyer)}
                  {o.expiresAt > 0n ? `, until ${fmtDate(o.expiresAt)}` : ''}
                </span>
              </div>
              {account && wallet && o.buyer.toLowerCase() === account.toLowerCase() && (
                <div style={{ minWidth: 160 }}>
                  <TxButton label="Withdraw offer" variant="quiet small" done="Withdrawn. Your MUSD is back."
                    run={(step) => cancelOffer(wallet, account, o, step)} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  )
}

function OfferForm({ listing }: { listing: Listing }) {
  const { account, wallet } = useApp()
  const [amount, setAmount] = useState('')
  const [expiry, setExpiry] = useState(7)
  const wei = toWei(amount)
  if (!account || !wallet) return null
  return (
    <div className="section">
      <h3>Or make an offer</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Your MUSD is held by the market contract until the seller accepts or you withdraw it. The offer only goes
        through if the lock is still at least this size and ends no sooner than it does now.
      </p>
      <div className="field">
        <label htmlFor="offer-amount">Your offer</label>
        <div className="input-row">
          <input id="offer-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span>MUSD</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="offer-expiry">Offer open for</label>
        <div className="input-row">
          <select id="offer-expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <TxButton
        label="Make offer"
        variant="ghost"
        disabled={!wei || wei === 0n}
        done="Offer made. The seller can accept it any time before it expires."
        run={(step) => makeOffer(wallet, account, listing.lock, wei!, expiryFrom(expiry), step)}
      />
    </div>
  )
}

function ManageListing({ listing }: { listing: Listing }) {
  const { account, wallet } = useApp()
  const [price, setPrice] = useState(tokens(listing.price).toString())
  const wei = toWei(price)
  // An expired listing would be rejected with its old end date, so reopen it with no end date.
  const expired = listing.expiresAt !== 0n && Number(listing.expiresAt) * 1000 < Date.now()
  const nextExpiry = expired ? 0n : listing.expiresAt
  if (!account || !wallet) return null
  return (
    <div className="section">
      <h3>Your listing</h3>
      {expired && <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>This listing has expired. Updating the price reopens it with no end date.</p>}
      <div className="field">
        <label htmlFor="new-price">Price</label>
        <div className="input-row">
          <input id="new-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <span>MUSD</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <TxButton label="Update price" variant="ghost" disabled={!wei || (wei === listing.price && !expired)}
          done="Price updated." run={(step) => updateListing(wallet, account, listing, wei!, nextExpiry, step)} />
        <TxButton label="Cancel listing and take the lock back" variant="quiet" done="Cancelled. The lock is back in your wallet."
          run={(step) => cancelListing(wallet, account, listing, step)} />
      </div>
    </div>
  )
}

export { EXPIRY_OPTIONS, expiryFrom }
