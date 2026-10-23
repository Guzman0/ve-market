# Unlocked

A market for locked Mezo positions. Holders of veMEZO and veBTC sell the whole lock for MUSD instead of waiting for it to end. Buyers get the position below what the locked tokens are worth, with its voting power.

Built for the Mezo Buildathon (Track 2: Access and Distribution, also Track 1: DeFi).

## The problem

Mezo locks cannot be opened early. A veMEZO lock can run for up to four years, and Mezo's own documentation states that unlocking before the end date is not possible. A holder who needs money before then has no way out.

Mezo's 2026 roadmap names exactly this gap: users who want to exit a lock early, or acquire voting power without waiting through a full lock period, and a planned veNFT marketplace to give them secondary-market liquidity.

## How it works

Every Mezo lock is an NFT in Mezo's VotingEscrow contract, and normal locks can be transferred. Unlocked uses that.

**Selling**
1. The seller picks a lock in their wallet and sets a price in MUSD. The app suggests a price from a chosen discount to the lock's value today.
2. The lock moves into the market contract while it is listed. This stops a seller from splitting, merging or withdrawing a position after a buyer has looked at it.
3. The seller can cancel at any time and take the lock back.

**Buying**
1. The buyer sees each lock's size, its value at today's on-chain price, time until unlock, voting power, discount, and the yearly return if held to unlock.
2. The buyer pays in MUSD with one signature (MUSD supports EIP-2612 permit) and one transaction. The lock lands in their wallet and the seller receives MUSD in the same transaction.

**Offers**
1. A buyer can offer MUSD on any lock, listed or not. The MUSD is held by the contract until the seller accepts or the buyer withdraws.
2. An offer records the lock's size and end date when it was made. It can only be accepted if the lock has not been shrunk or shortened since.

A 1% fee on each sale goes to the protocol. The fee is capped at 5% in the contract.

## Mezo integration

| What | How it is used |
| --- | --- |
| MUSD | The only payment asset. Permit signatures for one-step buys and offers. |
| veMEZO and veBTC (Mezo VotingEscrow) | The traded assets. Lock size, end date, permanent flag, voting power and transfer type read on chain. |
| Mezo PriceFeed | BTC price for valuing veBTC locks. |
| Mezo DEX router | MEZO price in MUSD for valuing veMEZO locks. |
| Mezo Borrow | Buyers short on MUSD are pointed to borrow it against their BTC. |

## Safety design

- **Listed locks are held by the contract.** A seller cannot reduce a lock that a buyer is about to pay for.
- **Offers check the lock at acceptance.** If the lock is smaller or ends sooner than when the offer was made, acceptance reverts.
- **Price protection.** `buy` takes a `maxPrice`, so a seller raising the price while a purchase is pending makes it fail instead of overcharging.
- **Only normal locks.** Locks deposited into managed pools cannot be listed (Mezo blocks their transfer anyway).
- **Limited admin.** The owner can set the fee (max 5%), the fee recipient and which escrow contracts are accepted. The owner cannot move listed locks or escrowed MUSD. Sellers can cancel and buyers can withdraw offers even if an escrow is later removed from the allow-list.
- **Reentrancy guard and checks-effects-interactions** on every state-changing function.
- **Front-run-safe permits.** If someone submits a buyer's permit signature first, the purchase still goes through.

## Contracts

| Contract | Address (Mezo testnet, chain 31611) |
| --- | --- |
| VeMarket | [`0xD55eC26d45dbE88b9Da2C476E2Cb96eC36A2e989`](https://explorer.test.mezo.org/address/0xD55eC26d45dbE88b9Da2C476E2Cb96eC36A2e989) |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| veBTC | `0xB63fcCd03521Cf21907627bd7fA465C129479231` |
| veMEZO | `0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b` |

## Tests

```
forge test
```

44 unit tests, including fuzz tests that check no MUSD is created or lost in sales and offers (100% line coverage).

4 more tests run against Mezo testnet itself: the deployed market selling a real veMEZO lock, a fresh market listing and selling real veBTC and veMEZO locks, and an offer accepted on a real veMEZO lock.

```
FOUNDRY_PROFILE=fork MEZO_RPC=https://rpc.test.mezo.org forge test --match-contract VeMarketForkTest -vv
```

Mezo testnet runs the Osaka EVM, so the fork profile sets `evm_version = "osaka"` to execute Mezo's own contracts.

## Run the app

```
cd web
npm install
npm run dev   # reads the deployed testnet market by default
```

## Roadmap

- Pay in BTC or MEZO as well as MUSD, as Mezo's roadmap describes for a veNFT marketplace.
- Show unclaimed Mezo Earn rewards and each lock's current votes in the listing.
- Buy-and-borrow in one step for buyers who hold BTC but not MUSD.
- Collection offers ("any veMEZO lock ending before 2028 at 0.8 MUSD per MEZO").
- Mainnet launch after an external review.

## Limits

Testnet only. The contract has not been audited.
