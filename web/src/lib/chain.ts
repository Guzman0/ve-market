import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Hash,
  type WalletClient,
  hexToSignature,
} from 'viem'
import { ADDR, mezoTestnet } from './config'
import { erc20PermitAbi } from './abis'

export const publicClient = createPublicClient({ chain: mezoTestnet, transport: http() })

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, cb: (...a: unknown[]) => void) => void }

function provider(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum
}

export function hasWallet() {
  return !!provider()
}

export function onWalletChange(cb: () => void) {
  const p = provider()
  p?.on?.('accountsChanged', cb)
  p?.on?.('chainChanged', cb)
}

/** Ask the wallet for an account and make sure it is on Mezo testnet. */
export async function connectWallet(): Promise<{ account: Address; wallet: WalletClient }> {
  const p = provider()
  if (!p) throw new Error('No wallet found. Install MetaMask or Rabby, then reload this page.')
  const accounts = (await p.request({ method: 'eth_requestAccounts' })) as Address[]
  await ensureMezo(p)
  const wallet = createWalletClient({ chain: mezoTestnet, transport: custom(p), account: accounts[0] })
  return { account: accounts[0], wallet }
}

export async function existingAccount(): Promise<{ account: Address; wallet: WalletClient } | null> {
  const p = provider()
  if (!p) return null
  const accounts = (await p.request({ method: 'eth_accounts' })) as Address[]
  if (!accounts.length) return null
  const wallet = createWalletClient({ chain: mezoTestnet, transport: custom(p), account: accounts[0] })
  return { account: accounts[0], wallet }
}

async function ensureMezo(p: Eip1193) {
  const hexId = `0x${mezoTestnet.id.toString(16)}`
  const current = (await p.request({ method: 'eth_chainId' })) as string
  if (current?.toLowerCase() === hexId) return
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  } catch {
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hexId,
        chainName: mezoTestnet.name,
        nativeCurrency: mezoTestnet.nativeCurrency,
        rpcUrls: mezoTestnet.rpcUrls.default.http,
        blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
      }],
    })
  }
}

/** Sign an EIP-2612 permit so MUSD can be spent with one signature instead of an approval. */
export async function signMusdPermit(
  wallet: WalletClient,
  owner: Address,
  spender: Address,
  value: bigint,
  deadline: bigint,
) {
  const [nonce, domain] = await Promise.all([
    publicClient.readContract({ address: ADDR.musd, abi: erc20PermitAbi, functionName: 'nonces', args: [owner] }),
    musdDomain(),
  ])
  const signature = await wallet.signTypedData({
    account: owner,
    domain,
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: { owner, spender, value, nonce, deadline },
  })
  const { v, r, s } = hexToSignature(signature)
  return { v: Number(v), r, s }
}

let cachedDomain: { name: string; version: string; chainId: number; verifyingContract: Address } | null = null

async function musdDomain() {
  if (cachedDomain) return cachedDomain
  try {
    const d = await publicClient.readContract({ address: ADDR.musd, abi: erc20PermitAbi, functionName: 'eip712Domain' })
    cachedDomain = { name: d[1], version: d[2], chainId: Number(d[3]), verifyingContract: d[4] }
  } catch {
    cachedDomain = { name: 'Mezo USD', version: '1', chainId: mezoTestnet.id, verifyingContract: ADDR.musd }
  }
  return cachedDomain
}

export async function waitFor(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The transaction failed on chain.')
  return receipt
}

export function explorerTx(hash: string) {
  return `${mezoTestnet.blockExplorers.default.url}/tx/${hash}`
}

export function explorerAddress(a: string) {
  return `${mezoTestnet.blockExplorers.default.url}/address/${a}`
}
