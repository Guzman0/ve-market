import type { Address } from 'viem'
import type { Listing, Lock, Offer, Prices } from './data'
import type { EscrowInfo } from './config'

/**
 * Sample data, used only when the page is opened with ?demo in the URL so the layout can be
 * reviewed before the contract is live. A banner on the page says it is sample data.
 */
export const DEMO =
  import.meta.env.VITE_DEMO === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo'))

const veMEZO: EscrowInfo = { kind: 'veMEZO', address: '0x00000000000000000000000000000000000000a1', asset: 'MEZO', maxLockDays: 1460 }
const veBTC: EscrowInfo = { kind: 'veBTC', address: '0x00000000000000000000000000000000000000b2', asset: 'BTC', maxLockDays: 28 }

const now = Math.floor(Date.now() / 1000)
const DAY = 86400
const e18 = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n

function lock(escrow: EscrowInfo, id: number, amount: number, days: number, vp: number, permanent = false): Lock {
  return {
    escrow, tokenId: BigInt(id), amount: e18(amount), end: permanent ? 0n : BigInt(now + days * DAY),
    isPermanent: permanent, votingPower: e18(vp), transferable: true,
  }
}

const seller = '0x7a3B5c1d9e0F2a4b6C8d0E1f3A5b7C9d1E3f5A71' as Address

export function demoData(): { prices: Prices; listings: Listing[]; offers: Offer[]; myLocks: Lock[] } {
  const listings: Listing[] = [
    { lock: lock(veMEZO, 412, 48_000, 790, 26_000), seller, price: e18(3_050), expiresAt: 0n },
    { lock: lock(veMEZO, 77, 12_500, 1_310, 11_200), seller, price: e18(710), expiresAt: BigInt(now + 9 * DAY) },
    { lock: lock(veMEZO, 1903, 150_000, 240, 24_600), seller, price: e18(11_400), expiresAt: 0n },
    { lock: lock(veBTC, 2551, 0.42, 19, 0.29), seller, price: e18(42_100), expiresAt: 0n },
    { lock: lock(veBTC, 2610, 0.05, 6, 0.011), seller, price: e18(5_280), expiresAt: 0n },
    { lock: lock(veMEZO, 15, 6_000, 0, 6_000, true), seller, price: e18(400), expiresAt: 0n },
  ]
  const offers: Offer[] = [
    {
      id: 1n, buyer: '0x91Fe2B0aC3d4E5f60718293a4B5c6D7e8F90a1B2', escrow: veMEZO, tokenId: 412n, amount: e18(2_900),
      expiresAt: BigInt(now + 3 * DAY), active: true, minLockAmount: e18(48_000), minLockEnd: BigInt(now + 790 * DAY),
    },
  ]
  const myLocks = [lock(veMEZO, 5120, 22_000, 1_020, 15_400), lock(veBTC, 2704, 0.08, 13, 0.037)]
  return { prices: { BTC: 104_250, MEZO: 0.0812, mezoSource: 'mainnet DEX' }, listings, offers, myLocks }
}
