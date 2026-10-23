import { defineChain, type Address } from 'viem'

export const mezoTestnet = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.test.mezo.org'] } },
  blockExplorers: { default: { name: 'Mezo Explorer', url: 'https://explorer.test.mezo.org' } },
  testnet: true,
})

const env = import.meta.env

/** Addresses from github.com/mezo-org/musd and github.com/mezo-org/tigris (testnet). */
export const ADDR = {
  market: (env.VITE_MARKET_ADDRESS || '0xD55eC26d45dbE88b9Da2C476E2Cb96eC36A2e989') as Address,
  musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503' as Address,
  priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366' as Address,
  router: '0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9' as Address,
  poolFactory: '0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A' as Address,
}

/** Block the market was deployed in; event scans start here. */
export const MARKET_DEPLOY_BLOCK = BigInt(env.VITE_MARKET_DEPLOY_BLOCK || '16309340')

export type LockKind = 'veMEZO' | 'veBTC'

export interface EscrowInfo {
  kind: LockKind
  address: Address
  asset: 'MEZO' | 'BTC'
  maxLockDays: number
}

export const ESCROWS: EscrowInfo[] = [
  ...((env.VITE_VEMEZO_ADDRESS || '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b')
    ? [{ kind: 'veMEZO' as const, address: (env.VITE_VEMEZO_ADDRESS || '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b') as Address, asset: 'MEZO' as const, maxLockDays: 4 * 365 }]
    : []),
  { kind: 'veBTC', address: '0xB63fcCd03521Cf21907627bd7fA465C129479231', asset: 'BTC', maxLockDays: 28 },
]

export function escrowByAddress(a: string): EscrowInfo | undefined {
  return ESCROWS.find((e) => e.address.toLowerCase() === a.toLowerCase())
}

export const isMarketConfigured = ADDR.market !== '0x0000000000000000000000000000000000000000'
