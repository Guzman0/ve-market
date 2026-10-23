import { useMemo, useState } from 'react'
import { useApp } from '../state'
import type { Listing } from '../lib/data'
import { daysLeft, discount, lockValue, returnToUnlock, tokens } from '../lib/metrics'
import { fmtMusd, fmtPct, fmtTokens, fmtUsd } from '../lib/format'
import { isMarketConfigured } from '../lib/config'
import { Timeline } from './ui'
import { ListingDrawer } from './ListingDrawer'

type Filter = 'all' | 'veMEZO' | 'veBTC'
type Sort = 'discount' | 'soonest' | 'price'

export function Market({ goSell }: { goSell: () => void }) {
  const { listings, prices, loading, loadError } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('discount')
  const [open, setOpen] = useState<Listing | null>(null)

  const rows = useMemo(() => {
    const enriched = listings
      .filter((l) => filter === 'all' || l.lock.escrow.kind === filter)
      .map((l) => {
        const value = lockValue(l.lock, prices)
        const price = tokens(l.price)
        const days = daysLeft(l.lock)
        return { l, value, price, days, disc: discount(price, value), ret: returnToUnlock(price, value, days) }
      })
    return enriched.sort((a, b) => {
      if (sort === 'price') return a.price - b.price
      if (sort === 'soonest') return (a.days ?? Infinity) - (b.days ?? Infinity)
      return (b.disc ?? -Infinity) - (a.disc ?? -Infinity)
    })
  }, [listings, prices, filter, sort])

  const lockedMezo = listings.filter((l) => l.lock.escrow.asset === 'MEZO').reduce((s, l) => s + tokens(l.lock.amount), 0)
  const lockedBtc = listings.filter((l) => l.lock.escrow.asset === 'BTC').reduce((s, l) => s + tokens(l.lock.amount), 0)

  return (
    <>
      <section className="intro">
        <div>
          <h1>Locked MEZO and BTC, for sale today.</h1>
        </div>
        <div>
          <p>
            Mezo locks cannot be opened early. Here, holders sell the whole position for MUSD instead of waiting,
            and buyers pick it up below what the locked tokens are worth, voting power included.
          </p>
          <div className="facts">
            <div><strong>{listings.length}</strong>positions listed</div>
            <div><strong>{lockedMezo.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</strong>MEZO locked</div>
            <div><strong>{lockedBtc.toLocaleString('en-GB', { maximumFractionDigits: 3 })}</strong>BTC locked</div>
          </div>
        </div>
      </section>

      {!isMarketConfigured && !loading && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>The market contract is not deployed yet.</strong> Listings will appear here once it is live on Mezo testnet.
        </div>
      )}
      {loadError && <div className="notice error" style={{ marginBottom: 14 }}>{loadError}</div>}

      <div className="toolbar">
        {(['all', 'veMEZO', 'veBTC'] as Filter[]).map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All locks' : f}
          </button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort listings">
          <option value="discount">Biggest discount</option>
          <option value="soonest">Unlocks soonest</option>
          <option value="price">Lowest price</option>
        </select>
      </div>

      <div className="book">
        <div className="book-head">
          <span>Position</span>
          <span>Locked</span>
          <span>Price</span>
          <span>Time until unlock</span>
          <span>Discount</span>
          <span>Yearly return to unlock</span>
          <span />
        </div>
        {loading && rows.length === 0 && <div className="empty">Reading the market from Mezo testnet</div>}
        {!loading && rows.length === 0 && (
          <div className="empty">
            <h3>No positions listed yet</h3>
            <p>If you hold a veMEZO or veBTC lock, you can be the first to list one.</p>
            <button className="btn ghost" onClick={goSell}>Sell a lock</button>
          </div>
        )}
        {rows.map(({ l, value, disc, ret }) => (
          <button className="book-row" key={`${l.lock.escrow.kind}-${l.lock.tokenId}`} onClick={() => setOpen(l)}>
            <div>
              <div className="pos-name">{l.lock.escrow.kind} #{l.lock.tokenId.toString()}</div>
              <div className="pos-sub">{fmtTokens(l.lock.votingPower, 2)} voting power</div>
            </div>
            <div>
              <div className="num-big">{fmtTokens(l.lock.amount)} {l.lock.escrow.asset}</div>
              <div className="pos-sub">Worth {fmtUsd(value)}</div>
            </div>
            <div className="num-big">{fmtMusd(l.price)}</div>
            <div className="col-timeline"><Timeline lock={l.lock} /></div>
            <div className={`num-big ${disc !== null && disc > 0 ? 'good' : disc !== null ? 'bad' : ''}`}>
              {disc === null ? 'n/a' : disc >= 0 ? `${fmtPct(disc)} off` : `${fmtPct(-disc)} over`}
            </div>
            <div className="num-big">{ret === null ? 'n/a' : fmtPct(ret)}</div>
            <div className="col-action"><span className="btn small ghost">View</span></div>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        Values use today's on-chain price from Mezo ({prices.BTC ? `BTC ${fmtUsd(prices.BTC)}` : 'BTC price unavailable'}
        {', '}
        {prices.MEZO ? `MEZO ${fmtUsd(prices.MEZO)} from the Mezo ${prices.mezoSource ?? 'DEX'}` : 'MEZO price unavailable'}). Yearly return assumes the price stays the same until the lock ends.
      </p>

      {open && <ListingDrawer listing={open} onClose={() => setOpen(null)} />}
    </>
  )
}
