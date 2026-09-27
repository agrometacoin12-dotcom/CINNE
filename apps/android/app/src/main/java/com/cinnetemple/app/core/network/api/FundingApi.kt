package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.ContributeRequest
import com.cinnetemple.app.core.network.dto.FundingPool
import com.cinnetemple.app.core.network.dto.RefundClaimResult
import com.cinnetemple.app.core.network.dto.TopupRequest
import com.cinnetemple.app.core.network.dto.TopupResult
import com.cinnetemple.app.core.network.dto.TopupStart
import com.cinnetemple.app.core.network.dto.TransferRequest
import com.cinnetemple.app.core.network.dto.TransferResult
import com.cinnetemple.app.core.network.dto.WalletSummary
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Coin wallet (1 coin = ₦1). Every route needs a signed-in user. */
interface WalletApi {
    /** Balance + last 50 ledger entries. */
    @GET(ApiRoutes.WALLET)
    suspend fun wallet(): WalletSummary

    /**
     * Starts a Paystack (or mock) top-up. Open authorizationUrl exactly like a
     * ticket checkout, then poll [verifyTopup]. 400 outside ₦100–₦1,000,000.
     */
    @POST(ApiRoutes.WALLET_TOPUPS)
    suspend fun buyCoins(@Body body: TopupRequest): TopupStart

    /** Idempotent; only the buyer can verify their own top-up (404 otherwise). */
    @GET(ApiRoutes.WALLET_TOPUPS_VERIFY)
    suspend fun verifyTopup(@Query("reference") reference: String): TopupResult

    /** Instant and irreversible. Same idempotencyKey = same transfer (double-tap safe). */
    @POST(ApiRoutes.WALLET_TRANSFERS)
    suspend fun sendCoins(@Body body: TransferRequest): TransferResult
}

/** Film funding pools. List + public detail are public; the rest need a user. */
interface FundingApi {
    @GET(ApiRoutes.FUNDING_POOLS)
    suspend fun pools(): List<FundingPool>

    /** Public detail (myStake always null). */
    @GET(ApiRoutes.FUNDING_POOL)
    suspend fun pool(@Path("id") id: String): FundingPool

    /** Signed-in detail — includes myStake. */
    @GET(ApiRoutes.FUNDING_POOL_ME)
    suspend fun myPool(@Path("id") id: String): FundingPool

    /** Wallet −N → pool +N. Same idempotencyKey = same contribution. */
    @POST(ApiRoutes.FUNDING_POOL_CONTRIBUTIONS)
    suspend fun contribute(@Path("id") id: String, @Body body: ContributeRequest): FundingPool

    /** Whole live stake back to the wallet as coins. Only while the pool is OPEN. */
    @POST(ApiRoutes.FUNDING_POOL_REFUND)
    suspend fun claimRefund(@Path("id") id: String): RefundClaimResult
}
