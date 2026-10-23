import type { Lock, Prices } from './data'

const DAY = 86_400

export function tokens(wei: bigint): number {
  return Number(wei) / 1e18
}

export function unitPrice(lock: Lock, prices: Prices): number | null {
  return lock.escrow.asset === 'BTC' ? prices.BTC : prices.MEZO
}

/** What the locked tokens are worth today, in USD (MUSD). */
export function lockValue(lock: Lock, prices: Prices): number | null {
  const p = unitPrice(lock, prices)
  return p === null ? null : tokens(lock.amount) * p
}

export function daysLeft(lock: Lock, now = Date.now() / 1000): number | null {
  if (lock.isPermanent) return null
  return Math.max(0, (Number(lock.end) - now) / DAY)
}

/** How far below the locked tokens' value the price sits. 0.2 = 20% below. */
export function discount(price: number, value: number | null): number | null {
  if (value === null || value <= 0) return null
  return 1 - price / value
}

/**
 * Annualised return for a buyer who pays `price`, waits until the unlock and then holds
 * tokens worth `value` (at today's token price).
 */
export function returnToUnlock(price: number, value: number | null, days: number | null): number | null {
  if (value === null || days === null || price <= 0) return null
  if (days < 1) return null
  const r = Math.pow(value / price, 365 / days) - 1
  return Number.isFinite(r) ? r : null
}

/** Suggested price for a seller who wants to sell at `disc` below today's value. */
export function priceAtDiscount(value: number, disc: number) {
  return value * (1 - disc)
}
