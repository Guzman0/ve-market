# AKINDO submission answers

Copy each answer into the matching field.

**Project name**
Unlocked

**Project category**
veNFT marketplace, early exit

**TL;DR**
Sell a locked veMEZO or veBTC position for MUSD instead of waiting for it to unlock, or buy one below its value with its voting power included.

**How it works**
Mezo locks cannot be opened early. A veMEZO lock can run for four years, and Mezo's 2026 roadmap names users who want to exit a lock early as an unsolved need.

Every Mezo lock is an NFT in Mezo's VotingEscrow contract, and normal locks can be transferred. Unlocked is a market for them:

- A seller lists a lock at a price in MUSD. The lock is held by the market contract while listed, so it cannot be split, merged or withdrawn under a buyer. The seller can cancel at any time.
- A buyer pays in MUSD with one permit signature and one transaction. The lock moves to the buyer and the seller is paid in the same transaction.
- A buyer can also make an offer on any lock. The MUSD is held by the contract until the owner accepts or the buyer withdraws. An offer only settles if the lock has not shrunk or been shortened since it was made.

Each listing shows the locked amount, its value at today's on-chain price (BTC from Mezo's PriceFeed, MEZO from Mezo's DEX), time until unlock, voting power, the discount, and the buyer's yearly return if held to unlock.

MUSD is the only payment asset, and buyers short on MUSD are sent to Mezo Borrow. A 1% fee on each sale goes to the protocol, capped at 5% in the contract.

Compared with pooling a lock into a liquid token (Aurove), Unlocked sells the exact lock: the seller sets the price, the buyer receives that lock with its own end date and voting power, and no liquidity pool is needed.

**Target group**
veMEZO and veBTC holders on Mezo who need liquidity before their lock ends, and MUSD holders who want voting power now or locked MEZO and BTC at a discount. Crypto-native users on desktop web with an EVM wallet (MetaMask, Rabby). Fits Track 2 (a marketplace for Mezo ecosystem products) and Track 1 (makes vote-escrow positions tradeable).

**Tech stack**
Solidity 0.8.28, Foundry (unit, fuzz and fork tests), OpenZeppelin, React, TypeScript, Vite, viem, GitHub Actions, GitHub Pages.

**Track**
Track 2 and Track 1

**Chain deployed on**
Mezo testnet (chain 31611)

**Project status**
Entirely new, built during Wave 1.

**Project readiness**
Testnet deployment.

**Future milestones**
1. Wave 2, by 15 November 2026: pay in BTC or MEZO as well as MUSD; borrow MUSD and buy a lock in one step through Mezo Borrow; show unclaimed rewards and votes on listings; rule-based offers; sale history.
2. December 2026: external security review; interviews with veMEZO holders on pricing.
3. Q1 2027: mainnet launch; selling part of a lock; borrowing against a lock without selling it.

**Team info**
Guzman, solo builder (product, research, build). X: @the_first_guz

**Links**
- Live app: [live app link]
- Code: https://github.com/Guzman0/ve-market
- Market contract: https://explorer.test.mezo.org/address/0xD55eC26d45dbE88b9Da2C476E2Cb96eC36A2e989
- Deck: [deck link]
- Pitch video: [video link]
