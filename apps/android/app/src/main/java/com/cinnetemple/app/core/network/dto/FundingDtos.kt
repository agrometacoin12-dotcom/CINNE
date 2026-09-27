package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/*
 * Coins & film funding — mirrors packages/shared/src/funding.contracts.ts.
 * 1 coin = ₦1. Viewers buy coins (Paystack), fund a film's pool, claim their
 * stake back as coins while the pool is OPEN, and send coins to each other.
 *
 * NOTE: request bodies deliberately give REQUIRED fields no default value —
 * the app's Json has encodeDefaults=false, so a defaulted field equal to its
 * default would be dropped from the body.
 */

// --- Wallet ---------------------------------------------------------------

/** One append-only ledger row. [delta] is signed: + credit, − debit. */
@Serializable
data class CoinLedgerEntry(
    val id: String = "",
    // TOPUP | POOL_FUND | POOL_REFUND | POOL_PAYOUT | TRANSFER_OUT | TRANSFER_IN
    val kind: String = "",
    val delta: Long = 0,
    val balanceAfter: Long = 0,
    val poolId: String? = null,
    val poolName: String? = null,
    val counterparty: String? = null,
    val note: String? = null,
    val createdAt: String = "",
)

/** GET /v1/wallet — balance + last 50 entries (newest first). */
@Serializable
data class WalletSummary(
    val balance: Long = 0,
    val nairaPerCoin: Int = 1,
    val entries: List<CoinLedgerEntry> = emptyList(),
)

/** POST /v1/wallet/topups — ₦100 to ₦1,000,000. */
@Serializable
data class TopupRequest(val coins: Long)

/**
 * POST /v1/wallet/topups response. Open [authorizationUrl] exactly like a
 * ticket purchase (mock checkout or Paystack), then poll
 * GET /v1/wallet/topups/verify?reference=. References start with `coin_`.
 */
@Serializable
data class TopupStart(
    val status: String = "pending",
    val reference: String = "",
    val coins: Long = 0,
    val amountMinor: Long = 0,
    val authorizationUrl: String? = null,
)

/** GET /v1/wallet/topups/verify?reference= — idempotent, safe to poll. */
@Serializable
data class TopupResult(
    val status: String = "pending", // "paid" | "failed" | "pending"
    val coins: Long = 0,
    val balance: Long = 0,
)

/** POST /v1/wallet/transfers — [idempotencyKey] is one per send attempt (8–64 chars). */
@Serializable
data class TransferRequest(
    val recipientEmail: String,
    val coins: Long,
    val idempotencyKey: String,
    val note: String? = null,
)

@Serializable
data class TransferResult(
    val status: String = "sent",
    val coins: Long = 0,
    val balance: Long = 0,
    val recipient: String = "",
)

// --- Funding pools --------------------------------------------------------

/** A backer's stake in one pool (only on the /me detail). */
@Serializable
data class PoolStake(
    /** Live stake (contributed − refunded). */
    val coins: Long = 0,
    val contributedCoins: Long = 0,
    val refundedCoins: Long = 0,
    val payoutCoins: Long? = null,
)

/**
 * FundingPool / FundingPoolDetail in one class — [myStake] is only present on
 * GET /v1/funding/pools/:id/me and the fund / refund / close responses.
 */
@Serializable
data class FundingPool(
    val id: String = "",
    val titleId: String? = null,
    val name: String = "",
    val description: String? = null,
    val status: String = "OPEN", // OPEN | CLOSED | PAID_OUT | CANCELLED
    val goalCoins: Long? = null,
    val totalCoins: Long = 0,
    val backers: Int = 0,
    val payoutCoins: Long? = null,
    /** Decimal string (4dp), set once the pool is paid out. */
    val nairaPerCoin: String? = null,
    val closesAt: String? = null,
    val createdAt: String = "",
    val paidOutAt: String? = null,
    val myStake: PoolStake? = null,
) {
    val isOpen: Boolean get() = status == "OPEN"
    val isPaidOut: Boolean get() = status == "PAID_OUT"
}

/** POST /v1/funding/pools/:id/contributions — at most 10,000,000 coins. */
@Serializable
data class ContributeRequest(
    val coins: Long,
    val idempotencyKey: String,
)

/** POST /v1/funding/pools/:id/refund — the whole live stake returns as coins. */
@Serializable
data class RefundClaimResult(
    val refundedCoins: Long = 0,
    val pool: FundingPool = FundingPool(),
)

// --- Admin ----------------------------------------------------------------

/** POST /v1/admin/funding/pools. Omitted (null) fields are left out of the body. */
@Serializable
data class CreatePoolRequest(
    val name: String,
    val description: String? = null,
    val titleId: String? = null,
    val goalCoins: Long? = null,
    /** ISO-8601 UTC. */
    val closesAt: String? = null,
)

/** POST /v1/admin/funding/pools/:id/payout — final. */
@Serializable
data class PayoutRequest(val payoutCoins: Long)

@Serializable
data class PayoutBacker(
    val userId: String = "",
    val name: String = "",
    val coins: Long = 0,
    val payoutCoins: Long = 0,
)

/** Payout preview (and the final payout response): ₦ per coin + each backer's share. */
@Serializable
data class PayoutPlan(
    val poolId: String = "",
    val totalCoins: Long = 0,
    val payoutCoins: Long = 0,
    val nairaPerCoin: String = "0",
    val backers: List<PayoutBacker> = emptyList(),
)

/** POST /v1/admin/funding/pools/:id/cancel — every backer refunded in coins. */
@Serializable
data class CancelPoolResult(
    val refundedBackers: Int = 0,
    val refundedCoins: Long = 0,
)
