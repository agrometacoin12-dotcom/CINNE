package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.CreatePurchaseRequest
import com.cinnetemple.app.core.network.dto.Entitlement
import com.cinnetemple.app.core.network.dto.PurchaseRecord
import com.cinnetemple.app.core.network.dto.PurchaseResponse
import com.cinnetemple.app.core.network.dto.VerifyPurchaseResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Purchases + entitlements. Android uses the standard authorizationUrl flow —
 * POST /v1/purchases/apple is iOS StoreKit only and no Play Billing endpoint exists.
 */
interface CommerceApi {
    /**
     * 404 title not purchasable; 400 gift recipient has no account.
     * status=pending -> open authorizationUrl, then poll [verify].
     */
    @POST(ApiRoutes.PURCHASES)
    suspend fun create(@Body body: CreatePurchaseRequest): PurchaseResponse

    /** Idempotent; with the MOCK driver always resolves "paid". */
    @GET(ApiRoutes.PURCHASES_VERIFY)
    suspend fun verify(@Query("reference") reference: String): VerifyPurchaseResponse

    /** Buyer's history (newest first, max 100), incl. gifts sent. */
    @GET(ApiRoutes.PURCHASES)
    suspend fun history(): List<PurchaseRecord>

    /** Lazily reconciles expiry; only ACTIVE-and-in-window items are playable. */
    @GET(ApiRoutes.ENTITLEMENTS)
    suspend fun entitlements(): List<Entitlement>
}
