import { formatUnits, parseUnits } from 'viem'

export function fmtNum(n: number, max = 2) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: max })
}

export function fmtTokens(wei: bigint, max = 4) {
  return fmtNum(Number(formatUnits(wei, 18)), max)
}

export function fmtUsd(n: number | null) {
  if (n === null) return 'No price yet'
  // Small token prices (MEZO is a fraction of a cent) need more digits to mean anything.
  const digits = n !== 0 && Math.abs(n) < 1 ? 5 : 2
  return '$' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: digits })
}

export function fmtMusd(wei: bigint) {
  return `${fmtTokens(wei, 2)} MUSD`
}

export function fmtPct(n: number | null, digits = 1) {
  if (n === null) return 'n/a'
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtDays(days: number | null) {
  if (days === null) return 'Permanent'
  if (days < 1) return 'Unlocked'
  if (days < 60) return `${Math.round(days)} days`
  if (days < 730) return `${Math.round(days / 30.4)} months`
  return `${(days / 365).toFixed(1)} years`
}

export function fmtDate(unix: bigint) {
  if (unix === 0n) return 'Never'
  return new Date(Number(unix) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function toWei(s: string) {
  const clean = s.replace(/,/g, '').trim()
  if (!clean || isNaN(Number(clean))) return null
  try {
    return parseUnits(clean, 18)
  } catch {
    return null
  }
}

/** Turns a wallet or contract error into one plain sentence. */
export function errorText(e: unknown): string {
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e)
  if (/user rejected|denied/i.test(msg)) return 'You cancelled the request in your wallet.'
  const known: Record<string, string> = {
    PriceTooHigh: 'The seller raised the price. Refresh and check the new price.',
    ListingExpired: 'This listing has expired.',
    NotListed: 'This position is no longer listed.',
    LockChanged: 'The lock is smaller or ends sooner than when the offer was made.',
    OfferExpired: 'This offer has expired.',
    OfferNotActive: 'This offer was already accepted or withdrawn.',
    NotTokenOwner: 'This wallet does not own that position.',
    NotTransferable: 'This position cannot be transferred (it is deposited in a managed pool).',
    CannotBuyOwnListing: 'You cannot buy your own position.',
    EscrowNotAllowed: 'This lock type is not accepted by the market.',
  }
  for (const [k, v] of Object.entries(known)) if (msg.includes(k)) return v
  if (/insufficient funds/i.test(msg)) return 'Not enough BTC in this wallet to pay for gas.'
  if (/ERC20InsufficientBalance/i.test(msg)) return 'Not enough MUSD in this wallet.'
  return msg.split('\n')[0]
}

/** Voting power: whole-number style for big positions, enough digits that a small veBTC lock does not read as 0. */
export function fmtPower(wei: bigint) {
  const n = Number(formatUnits(wei, 18))
  if (n === 0) return '0'
  if (n >= 100) return fmtNum(n, 0)
  return n.toLocaleString('en-GB', { maximumSignificantDigits: 3 })
}
