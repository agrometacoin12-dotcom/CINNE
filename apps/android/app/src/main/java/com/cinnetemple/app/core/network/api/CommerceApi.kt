package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.CreatePurchaseRequest
import com.cinnetemple.app.core.network.dto.CoinCredit
import com.cinnetemple.app.core.network.dto.CoinTicketRequest
import com.cinnetemple.app.core.network.dto.CoinWalletSummary
import com.cinnetemple.app.core.network.dto.Entitlement
import com.cinnetemple.app.core.network.dto.GooglePlayCoinRequest
import com.cinnetemple.app.core.network.dto.PurchaseRecord
import com.cinnetemple.app.core.network.dto.PurchaseResponse
import com.cinnetemple.app.core.network.dto.VerifyPurchaseResponse
import com.cinnetemple.app.core.network.dto.StoreCoinPack
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Purchases, shared coin wallet and entitlements. Google Play purchases are
 * verified and consumed by the backend before their coins are credited.
 */
interface CommerceApi {
    /**
     * 404 title not purchasable; 400 gift recipient has no account.
     * status=pending -> open authorizationUrl, then poll [verify].
     */
    @POST(ApiRoutes.PURCHASES)
    suspend fun create(@Body body: CreatePurchaseRequest): PurchaseResponse

    @POST(ApiRoutes.PURCHASES_COINS)
    suspend fun buyWithCoins(@Body body: CoinTicketRequest): PurchaseResponse

    @GET(ApiRoutes.WALLET)
    suspend fun wallet(): CoinWalletSummary

    @GET(ApiRoutes.WALLET_GOOGLE_PRODUCTS)
    suspend fun googleCoinProducts(): List<StoreCoinPack>

    @POST(ApiRoutes.WALLET_GOOGLE_CONFIRM)
    suspend fun confirmGoogleCoins(@Body body: GooglePlayCoinRequest): CoinCredit

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
