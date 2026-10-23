import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Address, WalletClient } from 'viem'
import { connectWallet, existingAccount, onWalletChange } from './lib/chain'
import { isMarketConfigured } from './lib/config'
import {
  loadListings, loadOffers, loadPrices, loadWalletLocks, musdBalance,
  type Listing, type Lock, type Offer, type Prices,
} from './lib/data'
import { errorText } from './lib/format'
import { DEMO, demoData } from './lib/demo'

interface AppState {
  account: Address | null
  wallet: WalletClient | null
  connect: () => Promise<void>
  prices: Prices
  listings: Listing[]
  offers: Offer[]
  myLocks: Lock[]
  musd: bigint | null
  loading: boolean
  loadError: string | null
  refresh: () => Promise<void>
  demo: boolean
}

const Ctx = createContext<AppState | null>(null)

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null)
  const [wallet, setWallet] = useState<WalletClient | null>(null)
  const [prices, setPrices] = useState<Prices>({ BTC: null, MEZO: null })
  const [listings, setListings] = useState<Listing[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [myLocks, setMyLocks] = useState<Lock[]>([])
  const [musd, setMusd] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (DEMO) {
        const d = demoData()
        setPrices(d.prices); setListings(d.listings); setOffers(d.offers); setMyLocks(account ? d.myLocks : [])
        return
      }
      const [p, l, o] = await Promise.all([
        loadPrices(),
        isMarketConfigured ? loadListings() : Promise.resolve([]),
        isMarketConfigured ? loadOffers() : Promise.resolve([]),
      ])
      setPrices(p); setListings(l); setOffers(o)
      if (account) {
        const [locks, bal] = await Promise.all([loadWalletLocks(account), musdBalance(account)])
        setMyLocks(locks); setMusd(bal)
      } else {
        setMyLocks([]); setMusd(null)
      }
    } catch (e) {
      setLoadError(`Could not read Mezo testnet: ${errorText(e)}`)
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const sync = () => existingAccount().then((r) => {
      setAccount(r?.account ?? null)
      setWallet(r?.wallet ?? null)
    })
    sync()
    onWalletChange(sync)
  }, [])

  const connect = useCallback(async () => {
    const r = await connectWallet()
    setAccount(r.account)
    setWallet(r.wallet)
  }, [])

  const value = useMemo<AppState>(
    () => ({ account, wallet, connect, prices, listings, offers, myLocks, musd, loading, loadError, refresh, demo: DEMO }),
    [account, wallet, connect, prices, listings, offers, myLocks, musd, loading, loadError, refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
