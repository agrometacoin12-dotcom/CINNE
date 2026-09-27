# Funding engine — coins

Viewers fund films with **coins**. **1 coin = ₦1.**

| Action       | What happens                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Buy coins    | Pay ₦N on Paystack → wallet +N coins                                                                                     |
| Fund a film  | Wallet −N coins → film pool +N coins                                                                                     |
| Refund claim | Whole remaining stake → back to wallet **as coins** (never cash). Only while the pool is `OPEN`.                         |
| Send coins   | Wallet −N → another user's wallet +N, instantly                                                                          |
| Payout       | Admin sets a payout of P coins. Each pooled coin earns **P ÷ T** (T = coins in the pool). Backers are credited in coins. |
| Cancel       | Every backer's stake → back to their wallet as coins                                                                     |

Coins never convert back to naira in this release. Any cash-out would be a new, KYC-gated feature.

## Pool lifecycle

```
OPEN ──close──▶ CLOSED ──payout──▶ PAID_OUT
  │                │
  └────cancel──────┴──────────────▶ CANCELLED (everyone refunded in coins)
```

- `OPEN` accepts coins until `closesAt` (optional) or until it reaches `goalCoins` (optional cap). Backers can claim refunds.
- `CLOSED` accepts no coins and no refund claims. It waits for the payout.
- A payout can be set **once**. It is final.

## Payout math

`nairaPerCoin = payoutCoins ÷ totalCoins`. A backer holding `c` coins gets `c × payoutCoins ÷ totalCoins`.

Shares are whole coins. The leftover from rounding is spread with the **largest-remainder method**: everyone first gets the floor of their share, then the few leftover coins go one each to the largest fractional parts. The shares always add up to **exactly** the payout, so no coins are created or lost. The logic is in `apps/backend/src/modules/funding/domain/payout.ts`.

Worked example: a pool has 90,000 coins (Ada 60,000, Chi 30,000). The payout is ₦135,000.

```
135,000 ÷ 90,000        = ₦1.5000 per coin
Ada  60,000 × 1.5       = 90,000 coins
Chi  30,000 × 1.5       = 45,000 coins
                          ──────
                          135,000 = payout ✓
```

With 3 backers of 1 coin each and a payout of 100: 33 + 33 + 34 = 100, and the extra coin goes to the tie-break winner (by stake, then id). The admin **preview** (`GET /v1/admin/funding/pools/:id/payout-preview?payoutCoins=`) shows this table before anything is credited.

## Paystack fees on coin top-ups

The **platform absorbs** the Paystack fee: the viewer pays ₦N and gets exactly N coins. Paystack's local rate is 1.5% + ₦100, with the ₦100 waived under ₦2,500 and the total capped at ₦2,000. Check the current rate at paystack.com/pricing before changing prices.

| Viewer pays | Coins     | Paystack fee            | Platform receives |
| ----------- | --------- | ----------------------- | ----------------- |
| ₦1,000      | 1,000     | ₦15                     | ₦985              |
| ₦2,500      | 2,500     | ₦37.50 + ₦100 = ₦137.50 | ₦2,362.50         |
| ₦10,000     | 10,000    | ₦150 + ₦100 = ₦250      | ₦9,750            |
| ₦1,000,000  | 1,000,000 | ₦15,100 → capped ₦2,000 | ₦998,000          |

Coins in circulation are a liability equal to their naira face value. Payout coins are issued by the platform, so a payout of P coins is a commitment of ₦P.

## Guarantees

- **Ledger = balance.** Every change to a balance writes one append-only `coin_ledger` row in the same transaction. The sum of a user's deltas always equals their wallet balance.
- **No overdraft.** Debits are conditional (`balance >= amount`). The database also has `CHECK (balance >= 0)` as a backstop.
- **At most once.** Top-ups flip `PENDING → PAID` once (verify and webhook can race safely). Transfers and contributions carry a client idempotency key, so a double-tap lands once. A refund claim is guarded against two concurrent claims.
- **Tamper-proof top-ups.** A Paystack settlement whose amount or currency differs from the stored top-up credits nothing.
- **Deadlock-free locking.** Locks are taken on the pool row first, then on wallets in ascending user id.

## API

| Method   | Path                                                                      | Who                                        |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| GET      | `/v1/wallet`                                                              | user — balance + last 50 entries           |
| POST     | `/v1/wallet/topups` `{ coins }`                                           | user — returns Paystack `authorizationUrl` |
| GET      | `/v1/wallet/topups/verify?reference=`                                     | user (own top-ups only)                    |
| POST     | `/v1/wallet/transfers` `{ recipientEmail, coins, idempotencyKey, note? }` | user                                       |
| GET      | `/v1/funding/pools`, `/v1/funding/pools/:id`                              | public                                     |
| GET      | `/v1/funding/pools/:id/me`                                                | user — includes `myStake`                  |
| POST     | `/v1/funding/pools/:id/contributions` `{ coins, idempotencyKey }`         | user                                       |
| POST     | `/v1/funding/pools/:id/refund`                                            | user — refunds whole stake as coins        |
| GET/POST | `/v1/admin/funding/pools`                                                 | admin — list / create                      |
| POST     | `/v1/admin/funding/pools/:id/close`                                       | admin                                      |
| GET      | `/v1/admin/funding/pools/:id/payout-preview?payoutCoins=`                 | admin                                      |
| POST     | `/v1/admin/funding/pools/:id/payout` `{ payoutCoins }`                    | admin — final                              |
| POST     | `/v1/admin/funding/pools/:id/cancel`                                      | admin — final                              |

Coin top-up references start with `coin_`. The existing Paystack webhook (`/v1/payments/webhook`) routes them to the wallet, so no new webhook URL is needed on the Paystack dashboard.

Limits (`domain/coins.ts`):

- Top-up: ₦100 to ₦1,000,000.
- Transfer: at most 1,000,000 coins.
- Contribution: at most 10,000,000 coins.
- Pool goal and payout: at most 1,000,000,000 coins.

## Testing

Unit tests (`payout.spec.ts`) run in the normal `pnpm test`. The Postgres suite (`funding.int.spec.ts`) needs a **throwaway** migrated database, as described in the file header. It covers concurrent overdraw attempts, double-tapped refunds, funding that races a payout, and ledger reconciliation.
