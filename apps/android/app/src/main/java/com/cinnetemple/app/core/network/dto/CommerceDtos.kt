package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/** POST /v1/purchases — beneficiaryEmail gifts to another EXISTING account. */
@Serializable
data class CreatePurchaseRequest(
    val titleId: String,
    val beneficiaryEmail: String? = null,
)

/**
 * POST /v1/purchases response — union of three shapes on `status`:
 *  - "already_entitled": go straight to playback.
 *  - "paid": free title (priceMinor 0), entitled instantly.
 *  - "pending": open [authorizationUrl] (mock checkout or Paystack — treat as an
 *    opaque URL), then poll GET /v1/purchases/verify?reference= until != pending.
 */
@Serializable
data class PurchaseResponse(
    val status: String = "",
    val titleId: String = "",
    val reference: String? = null,
    val amountMinor: Long? = null,
    val currency: String? = null,
    val authorizationUrl: String? = null,
    val isGift: Boolean = false,
) {
    val isAlreadyEntitled: Boolean get() = status == "already_entitled"
    val isPaid: Boolean get() = status == "paid"
    val isPending: Boolean get() = status == "pending"
}

/** GET /v1/purchases/verify?reference= — idempotent, safe to poll. */
@Serializable
data class VerifyPurchaseResponse(
    val status: String = "pending", // "paid" | "failed" | "pending"
    val titleId: String = "",
)

/** GET /v1/purchases item — buyer's history incl. gifts sent. */
@Serializable
data class PurchaseRecord(
    val id: String = "",
    val titleId: String = "",
    val titleName: String = "",
    val amountMinor: Long = 0,
    val currency: String = "NGN",
    val status: String = "", // PENDING | PAID | FAILED | REFUNDED
    val isGift: Boolean = false,
    val createdAt: String = "",
)

/**
 * GET /v1/entitlements item. Only ACTIVE-and-in-window entitlements are
 * playable. Never cache an "owns this" flag — always re-check playback status.
 */
@Serializable
data class Entitlement(
    val titleId: String = "",
    val status: String = "", // ACTIVE | EXPIRED | CONSUMED | REVOKED
    val startedAt: String? = null,
    val expiresAt: String? = null,
    val title: TitleSummary? = null,
)
