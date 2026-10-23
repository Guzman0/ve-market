import type { Address, WalletClient } from 'viem'
import { publicClient, signMusdPermit, waitFor } from './chain'
import { ADDR, mezoTestnet } from './config'
import { marketAbi } from './marketAbi'
import { veAbi } from './abis'
import type { Listing, Lock, Offer } from './data'

type Step = (label: string) => void

function deadline(minutes = 30) {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60)
}

async function ensureNftApproval(wallet: WalletClient, account: Address, lock: Lock, step: Step) {
  const [approved, forAll] = await Promise.all([
    publicClient.readContract({ address: lock.escrow.address, abi: veAbi, functionName: 'getApproved', args: [lock.tokenId] }),
    publicClient
      .readContract({ address: lock.escrow.address, abi: veAbi, functionName: 'isApprovedForAll', args: [account, ADDR.market] })
      .catch(() => false),
  ])
  if (approved.toLowerCase() === ADDR.market.toLowerCase() || forAll) return
  step('Approve the market to move this position (1 of 2)')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: lock.escrow.address, abi: veAbi, functionName: 'approve',
    args: [ADDR.market, lock.tokenId],
  })
  step('Waiting for the approval to confirm')
  await waitFor(hash)
}

export async function listLock(
  wallet: WalletClient, account: Address, lock: Lock, price: bigint, expiresAt: bigint, step: Step,
) {
  await ensureNftApproval(wallet, account, lock, step)
  step('Confirm the listing in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'list',
    args: [lock.escrow.address, lock.tokenId, price, expiresAt],
  })
  step('Waiting for the listing to confirm')
  await waitFor(hash)
  return hash
}

export async function buyListing(wallet: WalletClient, account: Address, listing: Listing, step: Step) {
  const dl = deadline()
  step('Sign to allow the MUSD payment (no gas)')
  const { v, r, s } = await signMusdPermit(wallet, account, ADDR.market, listing.price, dl)
  step('Confirm the purchase in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'buyWithPermit',
    args: [listing.lock.escrow.address, listing.lock.tokenId, listing.price, dl, v, r, s],
  })
  step('Waiting for the purchase to confirm')
  await waitFor(hash)
  return hash
}

export async function makeOffer(
  wallet: WalletClient, account: Address, lock: Lock, amount: bigint, expiresAt: bigint, step: Step,
) {
  const dl = deadline()
  step('Sign to allow the MUSD deposit (no gas)')
  const { v, r, s } = await signMusdPermit(wallet, account, ADDR.market, amount, dl)
  step('Confirm the offer in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'makeOfferWithPermit',
    args: [lock.escrow.address, lock.tokenId, amount, expiresAt, dl, v, r, s],
  })
  step('Waiting for the offer to confirm')
  await waitFor(hash)
  return hash
}

export async function cancelListing(wallet: WalletClient, account: Address, listing: Listing, step: Step) {
  step('Confirm in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'cancelListing',
    args: [listing.lock.escrow.address, listing.lock.tokenId],
  })
  step('Waiting for confirmation')
  await waitFor(hash)
  return hash
}

export async function updateListing(
  wallet: WalletClient, account: Address, listing: Listing, price: bigint, expiresAt: bigint, step: Step,
) {
  step('Confirm the new price in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'updateListing',
    args: [listing.lock.escrow.address, listing.lock.tokenId, price, expiresAt],
  })
  step('Waiting for confirmation')
  await waitFor(hash)
  return hash
}

export async function cancelOffer(wallet: WalletClient, account: Address, offer: Offer, step: Step) {
  step('Confirm in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'cancelOffer', args: [offer.id],
  })
  step('Waiting for confirmation')
  await waitFor(hash)
  return hash
}

/** Accepts an offer. If the lock is in the wallet (not listed), approve the market first. */
export async function acceptOffer(
  wallet: WalletClient, account: Address, offer: Offer, lock: Lock, listedByMe: boolean, step: Step,
) {
  if (!listedByMe) await ensureNftApproval(wallet, account, lock, step)
  step('Confirm the sale in your wallet')
  const hash = await wallet.writeContract({
    account, chain: mezoTestnet, address: ADDR.market, abi: marketAbi, functionName: 'acceptOffer', args: [offer.id],
  })
  step('Waiting for the sale to confirm')
  await waitFor(hash)
  return hash
}
