package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/*
 * Producer dashboard (admin side) — mirrors packages/shared/src/producer.contracts.ts.
 * Money is kobo (minor units). Revenue share is basis points (9000 = 90%).
 *
 * NOTE: request bodies give REQUIRED fields no default value — the app's Json
 * has encodeDefaults=false, so a defaulted field equal to its default would be
 * dropped from the body.
 */

/** The producer linked to a title. */
@Serializable
data class TitleProducer(
    val email: String = "",
    val name: String? = null,
    val revenueShareBps: Int = 9000,
    val linkSentAt: String = "",
    val lastSeenAt: String? = null,
)

/** GET /v1/admin/movies/{id}/producer. */
@Serializable
data class TitleProducerResponse(val producer: TitleProducer? = null)

/** PUT /v1/admin/movies/{id}/producer — emails the producer their dashboard link. */
@Serializable
data class AssignProducerRequest(
    val email: String,
    val name: String? = null,
    /** 0–10000. */
    val revenueShareBps: Int,
)

/** One row of the admin payout queue (GET /v1/admin/producer-withdrawals). */
@Serializable
data class AdminProducerWithdrawal(
    val id: String = "",
    val amountMinor: Long = 0,
    val bankName: String = "",
    val accountNumber: String = "",
    val accountName: String = "",
    val status: String = "REQUESTED", // REQUESTED | PAID | REJECTED
    val requestedAt: String? = null,
    val reviewedAt: String? = null,
    val transferRef: String? = null,
    val note: String? = null,
    val createdAt: String = "",
    val producerEmail: String = "",
    val producerName: String? = null,
)

/** POST /v1/admin/producer-withdrawals/{id}/paid — 3–120 chars. */
@Serializable
data class MarkWithdrawalPaidRequest(val transferRef: String)

/** POST /v1/admin/producer-withdrawals/{id}/reject — 3–500 chars. */
@Serializable
data class RejectWithdrawalRequest(val note: String)
