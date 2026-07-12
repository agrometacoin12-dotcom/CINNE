package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** TitleDetail + admin-only fields; includes drafts. */
@Serializable
data class AdminTitle(
    val id: String = "",
    val type: String = "movie",
    val title: String = "",
    val year: Int = 0,
    val rating: Double? = null,
    val genres: List<String> = emptyList(),
    val posterUrl: String? = null,
    val tagline: String? = null,
    val overview: String = "",
    val runtimeMinutes: Int? = null,
    val seasons: Int? = null,
    val maturityRating: String? = null,
    val heroUrl: String? = null,
    val cast: List<String> = emptyList(),
    val director: String? = null,
    val categories: List<String> = emptyList(),
    val priceMinor: Long = 0,
    val currency: String = "NGN",
    val durationSeconds: Int? = null,
    val isPremiere: Boolean = false,
    val premiereStartAt: String? = null,
    val premiereLive: Boolean = false,
    val hasVideo: Boolean = false,
    // Admin-only:
    val status: String = "draft", // "draft" | "published"
    val featured: Boolean = false,
    val videoKey: String? = null,
    val posterKey: String? = null,
    val heroKey: String? = null,
    val popularity: Int = 50,
)

/**
 * POST /v1/admin/movies. Required: title, overview, year. Defaults server-side:
 * type movie, status draft, priceMinor 0 (kobo), currency NGN, popularity 50.
 * Category "new-listings" is ALWAYS auto-added.
 */
@Serializable
data class CreateMovieRequest(
    val title: String,
    val overview: String,
    val year: Int,
    val type: String? = null,
    val tagline: String? = null,
    val genres: List<String>? = null,
    val cast: List<String>? = null,
    val director: String? = null,
    val categories: List<String>? = null,
    val maturityRating: String? = null,
    val runtimeMinutes: Int? = null,
    val durationSeconds: Int? = null,
    val priceMinor: Long? = null,
    val currency: String? = null,
    val posterKey: String? = null,
    val heroKey: String? = null,
    val videoKey: String? = null,
    val popularity: Int? = null,
    val status: String? = null,
    val isPremiere: Boolean? = null,
    val premiereStartAt: String? = null,
)

/**
 * PATCH /v1/admin/movies/{id} — omitted = unchanged. NOTE: null fields here are
 * OMITTED from the JSON (explicitNulls=false); to send an EXPLICIT null that
 * CLEARS a nullable field (tagline, director, maturityRating, posterKey,
 * heroKey, videoKey, premiereStartAt) use AdminApi.updateMovieRaw with a
 * hand-built [JsonObject].
 */
@Serializable
data class UpdateMovieRequest(
    val title: String? = null,
    val overview: String? = null,
    val year: Int? = null,
    val type: String? = null,
    val tagline: String? = null,
    val genres: List<String>? = null,
    val cast: List<String>? = null,
    val director: String? = null,
    val categories: List<String>? = null,
    val maturityRating: String? = null,
    val runtimeMinutes: Int? = null,
    val durationSeconds: Int? = null,
    val priceMinor: Long? = null,
    val currency: String? = null,
    val posterKey: String? = null,
    val heroKey: String? = null,
    val videoKey: String? = null,
    val popularity: Int? = null,
    val status: String? = null,
    val isPremiere: Boolean? = null,
    val premiereStartAt: String? = null,
)

@Serializable
data class DeleteMovieResponse(
    val deleted: Boolean = false,
    val id: String = "",
    val soldTickets: Int = 0,
)

/** PUT /v1/admin/movies/{id}/featured — true atomically un-features every other title. */
@Serializable
data class FeaturedRequest(val featured: Boolean)

/** PUT /v1/admin/movies/{id}/premiere — isPremiere true REQUIRES premiereStartAt. */
@Serializable
data class PremiereScheduleRequest(
    val isPremiere: Boolean,
    val premiereStartAt: String? = null,
)

/** POST /v1/admin/uploads/presign — kind video|poster|hero; contentType allowlisted. */
@Serializable
data class PresignRequest(
    val kind: String,
    val contentType: String,
)

@Serializable
data class PresignResponse(
    val enabled: Boolean = false,
    val key: String = "",
    val uploadUrl: String = "",
    /** PUT must carry EXACTLY these headers (Content-Type is inside the HMAC). */
    val headers: Map<String, String> = emptyMap(),
)

/** PUT {uploadUrl} response. */
@Serializable
data class UploadResult(
    val stored: Boolean = false,
    val key: String = "",
)

/** GET /v1/admin/uploads/stat?key= */
@Serializable
data class UploadStatResponse(
    val exists: Boolean = false,
    val size: Long = 0,
)

@Serializable
data class AdminUser(
    val id: String = "",
    val email: String = "",
    val displayName: String? = null,
    val roles: List<String> = emptyList(),
    val status: String = "",
    val emailVerified: Boolean = false,
    val createdAt: String = "",
    val purchases: Int = 0,
)

@Serializable
data class AdminUsersResponse(
    val total: Int = 0,
    val users: List<AdminUser> = emptyList(),
)

/** PUT /v1/admin/users/{id}/roles — REPLACES the whole set; only "user"/"admin". */
@Serializable
data class UpdateRolesRequest(val roles: List<String>)

/** PUT /v1/admin/users/{id}/status — "ACTIVE" | "SUSPENDED" only. */
@Serializable
data class UpdateUserStatusRequest(val status: String)

@Serializable
data class AdminPurchase(
    val id: String = "",
    val userId: String = "",
    val userEmail: String = "",
    val userDisplayName: String? = null,
    val titleId: String = "",
    val titleName: String = "",
    val amountMinor: Long = 0,
    val currency: String = "NGN",
    val provider: String = "", // MOCK | PAYSTACK | APPLE_IAP
    val status: String = "",
    val isGift: Boolean = false,
    val entitlementStatus: String? = null,
    val createdAt: String = "",
    val paidAt: String? = null,
)

@Serializable
data class AdminPurchasesResponse(
    val total: Int = 0,
    val items: List<AdminPurchase> = emptyList(),
)

@Serializable
data class AuditEntry(
    val id: String = "",
    val actorId: String? = null,
    val actorEmail: String? = null,
    val action: String = "",
    val entity: String? = null,
    val entityId: String? = null,
    val metadata: JsonObject? = null,
    val ip: String? = null,
    val createdAt: String = "",
)

@Serializable
data class AuditResponse(
    val total: Int = 0,
    val items: List<AuditEntry> = emptyList(),
)

@Serializable
data class RevenueBucket(
    val currency: String = "NGN",
    /** kobo — divide by 100 for naira. */
    val totalMinor: Long = 0,
)

/** GET /v1/admin/stats — purchases counts PAID only. */
@Serializable
data class AdminStats(
    val users: Int = 0,
    val titles: Int = 0,
    val published: Int = 0,
    val purchases: Int = 0,
    val activeEntitlements: Int = 0,
    val revenue: List<RevenueBucket> = emptyList(),
)
