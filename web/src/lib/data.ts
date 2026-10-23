import { createPublicClient, fallback, http, type Address, type PublicClient } from 'viem'
import { publicClient } from './chain'
import { ADDR, ESCROWS, MARKET_DEPLOY_BLOCK, escrowByAddress, type EscrowInfo } from './config'
import { marketAbi } from './marketAbi'
import { priceFeedAbi, routerAbi, veAbi } from './abis'

export interface Lock {
  escrow: EscrowInfo
  tokenId: bigint
  amount: bigint // locked tokens, 18 decimals
  end: bigint // unix seconds; 0 when permanent
  isPermanent: boolean
  votingPower: bigint
  transferable: boolean
}

export interface Listing {
  lock: Lock
  seller: Address
  price: bigint // MUSD
  expiresAt: bigint
}

export interface Offer {
  id: bigint
  buyer: Address
  escrow: EscrowInfo
  tokenId: bigint
  amount: bigint
  expiresAt: bigint
  active: boolean
  minLockAmount: bigint
  minLockEnd: bigint
}

/** USD per whole token. null when no on-chain price is available. */
export interface Prices {
  BTC: number | null
  MEZO: number | null
  /** Where the MEZO price came from, shown next to valuations. */
  mezoSource?: 'testnet DEX' | 'mainnet DEX' | 'CoinGecko'
}

export async function readLock(escrow: EscrowInfo, tokenId: bigint): Promise<Lock> {
  const [locked, votingPower, kind] = await Promise.all([
    publicClient.readContract({ address: escrow.address, abi: veAbi, functionName: 'locked', args: [tokenId] }),
    // veMEZO names it votingPowerOfNFT; veBTC (older code) names it balanceOfNFT.
    publicClient
      .readContract({ address: escrow.address, abi: veAbi, functionName: 'votingPowerOfNFT', args: [tokenId] })
      .catch(() =>
        publicClient.readContract({ address: escrow.address, abi: veAbi, functionName: 'balanceOfNFT', args: [tokenId] }),
      )
      .catch(() => 0n),
    publicClient.readContract({ address: escrow.address, abi: veAbi, functionName: 'escrowType', args: [tokenId] }),
  ])
  return {
    escrow,
    tokenId,
    amount: locked.amount > 0n ? BigInt(locked.amount) : 0n,
    end: locked.end,
    isPermanent: locked.isPermanent,
    votingPower,
    transferable: kind === 0,
  }
}

/** Logs are fetched in chunks because RPCs cap the block range of a single query. */
async function scanEvents<T>(fetch: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const latest = await publicClient.getBlockNumber()
  const out: T[] = []
  let step = 10_000n // Mezo testnet RPC rejects log queries wider than 10,000 blocks
  let from = MARKET_DEPLOY_BLOCK
  while (from <= latest) {
    const to = from + step - 1n > latest ? latest : from + step - 1n
    try {
      out.push(...(await fetch(from, to)))
      from = to + 1n
    } catch (e) {
      if (step <= 1_000n) throw e
      step /= 2n
    }
  }
  return out
}

export async function loadListings(): Promise<Listing[]> {
  const logs = await scanEvents((fromBlock, toBlock) =>
    publicClient.getContractEvents({ address: ADDR.market, abi: marketAbi, eventName: 'Listed', fromBlock, toBlock }),
  )
  const seen = new Map<string, { escrow: Address; tokenId: bigint }>()
  for (const l of logs) {
    const { escrow, tokenId } = l.args as { escrow: Address; tokenId: bigint }
    seen.set(`${escrow.toLowerCase()}:${tokenId}`, { escrow, tokenId })
  }
  const results = await Promise.all(
    [...seen.values()].map(async ({ escrow, tokenId }) => {
      const info = escrowByAddress(escrow)
      if (!info) return null
      const l = await publicClient.readContract({
        address: ADDR.market, abi: marketAbi, functionName: 'getListing', args: [escrow, tokenId],
      })
      if (l.seller === '0x0000000000000000000000000000000000000000') return null
      const lock = await readLock(info, tokenId)
      return { lock, seller: l.seller, price: l.price, expiresAt: l.expiresAt } satisfies Listing
    }),
  )
  return results.filter((x): x is Listing => x !== null)
}

export async function loadOffers(): Promise<Offer[]> {
  const count = await publicClient.readContract({ address: ADDR.market, abi: marketAbi, functionName: 'offerCount' })
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1))
  const offers = await Promise.all(
    ids.map(async (id) => {
      const o = await publicClient.readContract({ address: ADDR.market, abi: marketAbi, functionName: 'getOffer', args: [id] })
      const escrow = escrowByAddress(o.escrow)
      if (!escrow) return null
      return {
        id, buyer: o.buyer, escrow, tokenId: o.tokenId, amount: o.amount, expiresAt: o.expiresAt,
        active: o.active, minLockAmount: o.minLockAmount, minLockEnd: o.minLockEnd,
      } satisfies Offer
    }),
  )
  return offers.filter((x): x is Offer => x !== null)
}

/** All locks a wallet holds in each supported escrow. */
export async function loadWalletLocks(owner: Address): Promise<Lock[]> {
  const perEscrow = await Promise.all(
    ESCROWS.map(async (escrow) => {
      const n = await publicClient.readContract({ address: escrow.address, abi: veAbi, functionName: 'balanceOf', args: [owner] })
      const ids = await Promise.all(
        Array.from({ length: Number(n) }, (_, i) =>
          publicClient.readContract({
            address: escrow.address, abi: veAbi, functionName: 'ownerToNFTokenIdList', args: [owner, BigInt(i)],
          }),
        ),
      )
      return Promise.all(ids.filter((id) => id !== 0n).map((id) => readLock(escrow, id)))
    }),
  )
  return perEscrow.flat()
}

export async function loadPrices(): Promise<Prices> {
  const btc = publicClient
    .readContract({ address: ADDR.priceFeed, abi: priceFeedAbi, functionName: 'fetchPrice' })
    .then((p) => Number(p) / 1e18)
    .catch(() => null)

  const hasVeMezo = ESCROWS.some((e) => e.kind === 'veMEZO')
  const mezo: Promise<{ price: number; source: Prices['mezoSource'] } | null> = hasVeMezo
    ? (async () => {
        // Testnet MEZO pools have no real liquidity, so fall back to Mezo mainnet's DEX.
        const testnet = await quoteInMusd(publicClient, MEZO_TOKEN, ADDR.musd, ADDR.router, ADDR.poolFactory)
        if (testnet !== null) return { price: testnet, source: 'testnet DEX' as const }
        const mainnet = await quoteInMusd(mainnetClient, MEZO_TOKEN, MAINNET.musd, MAINNET.router, MAINNET.poolFactory).catch(() => null)
        if (mainnet !== null) return { price: mainnet, source: 'mainnet DEX' as const }
        // MEZO trades on Mezo's concentrated-liquidity pools, which this router does not quote.
        const cg = await coingeckoUsd('mezo')
        return cg === null ? null : { price: cg, source: 'CoinGecko' as const }
      })().catch(() => null)
    : Promise.resolve(null)

  const [BTC, m] = await Promise.all([btc, mezo])
  return { BTC, MEZO: m?.price ?? null, mezoSource: m?.source }
}

/** MEZO is a precompile at the same address on Mezo testnet and mainnet. */
const MEZO_TOKEN = '0x7B7c000000000000000000000000000000000001' as Address

/** Mezo mainnet DEX (github.com/mezo-org/tigris and mezo-org/musd mainnet deployments). */
const MAINNET = {
  musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186' as Address,
  router: '0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706' as Address,
  poolFactory: '0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248' as Address,
}

const mainnetClient = createPublicClient({
  transport: fallback([
    http('https://mainnet.mezo.public.validationcloud.io'),
    http('https://mezo.drpc.org'),
    http('https://mezo-mainnet.boar.network'),
  ]),
})

async function coingeckoUsd(id: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`)
    const j = (await r.json()) as Record<string, { usd?: number }>
    const v = j[id]?.usd
    return typeof v === 'number' && v > 0 ? v : null
  } catch {
    return null
  }
}

/** Price of one token in MUSD from a Mezo DEX, trying the volatile pool then the stable one. */
async function quoteInMusd(
  client: PublicClient, token: Address, musd: Address, router: Address, factory: Address,
): Promise<number | null> {
  for (const stable of [false, true]) {
    try {
      const amounts = await client.readContract({
        address: router, abi: routerAbi, functionName: 'getAmountsOut',
        args: [10n ** 18n, [{ from: token, to: musd, stable, factory }]],
      })
      const out = amounts[amounts.length - 1]
      // A real pool returns a meaningful amount; ignore dust from empty test pools.
      if (out > 10n ** 12n) return Number(out) / 1e18
    } catch {
      /* try the next pool type */
    }
  }
  return null
}

export async function musdBalance(owner: Address) {
  return publicClient.readContract({
    address: ADDR.musd,
    abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'balanceOf',
    args: [owner],
  })
}
