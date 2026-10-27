package com.cinnetemple.app.core.commerce

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.api.CommerceApi
import com.cinnetemple.app.core.network.dto.GooglePlayCoinRequest
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

data class GoogleCoinProduct(
    val details: ProductDetails,
    val coins: Int,
) {
    val productId: String get() = details.productId
    val displayPrice: String
        get() = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.formattedPrice ?: "Unavailable"
}

data class CoinWalletState(
    val balance: Int = 0,
    val products: List<GoogleCoinProduct> = emptyList(),
    val loading: Boolean = false,
    val purchasing: Boolean = false,
    val message: String? = null,
    val isError: Boolean = false,
)

/**
 * One process-wide Play Billing connection. Google supplies localized product
 * details; the CinneTemple API verifies the purchase token, binds it to the
 * signed-in user, credits once, then consumes it server-side.
 */
class GooglePlayBillingManager(
    context: Context,
    private val scope: CoroutineScope,
    private val commerce: CommerceApi,
    private val userId: () -> String?,
) : PurchasesUpdatedListener {
    private val connectionMutex = Mutex()
    private val processingTokens = mutableSetOf<String>()
    private var allowedProducts: Map<String, Int> = emptyMap()

    private val _state = MutableStateFlow(CoinWalletState())
    val state: StateFlow<CoinWalletState> = _state.asStateFlow()

    private val billingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        .enableAutoServiceReconnection()
        .build()

    suspend fun load() {
        _state.update { it.copy(loading = true, message = null, isError = false) }
        try {
            ensureConnected()
            val backendProducts = commerce.googleCoinProducts()
            allowedProducts = backendProducts.associate { it.productId to it.coins }
            val queried = queryProducts(allowedProducts.keys.toList())
            if (queried.first.responseCode != BillingClient.BillingResponseCode.OK) {
                throw BillingFailure(queried.first.debugMessage)
            }
            val products = queried.second.productDetailsList.mapNotNull { details ->
                allowedProducts[details.productId]?.let { coins -> GoogleCoinProduct(details, coins) }
            }.sortedBy { it.coins }
            _state.update { it.copy(products = products) }
            recoverInternal()
            refreshBalance()
            _state.update {
                it.copy(
                    loading = false,
                    message = if (products.isEmpty()) "Coin packs are not available from Google Play yet." else it.message,
                    isError = products.isEmpty(),
                )
            }
        } catch (error: Exception) {
            _state.update {
                it.copy(loading = false, purchasing = false, message = error.userMessage(), isError = true)
            }
        }
    }

    fun buy(activity: Activity, productId: String) {
        val currentUserId = userId() ?: return
        val product = _state.value.products.firstOrNull { it.productId == productId } ?: return
        val offer = product.details.oneTimePurchaseOfferDetailsList?.firstOrNull()
        if (offer == null) {
            _state.update { it.copy(message = "This coin pack is not available for purchase.", isError = true) }
            return
        }
        val offerToken = offer.offerToken
        if (offerToken.isNullOrBlank()) {
            _state.update { it.copy(message = "This coin pack has no active Google Play offer.", isError = true) }
            return
        }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product.details)
            .setOfferToken(offerToken)
            .build()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(googlePlayAccountId(currentUserId))
            .build()
        _state.update { it.copy(purchasing = true, message = null, isError = false) }
        val result = billingClient.launchBillingFlow(activity, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            _state.update {
                it.copy(purchasing = false, message = billingMessage(result), isError = true)
            }
        }
    }

    suspend fun recover() {
        _state.update { it.copy(purchasing = true, message = null, isError = false) }
        try {
            ensureConnected()
            recoverInternal()
            refreshBalance()
        } catch (error: Exception) {
            _state.update { it.copy(message = error.userMessage(), isError = true) }
        } finally {
            _state.update { it.copy(purchasing = false) }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> scope.launch {
                processPurchases(purchases.orEmpty())
                refreshBalance()
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                _state.update { it.copy(purchasing = false) }
            }
            else -> {
                _state.update {
                    it.copy(purchasing = false, message = billingMessage(result), isError = true)
                }
            }
        }
    }

    private suspend fun recoverInternal() {
        val result = queryPurchases()
        if (result.first.responseCode != BillingClient.BillingResponseCode.OK) {
            throw BillingFailure(result.first.debugMessage)
        }
        processPurchases(result.second)
    }

    private suspend fun processPurchases(purchases: List<Purchase>) {
        if (purchases.isEmpty()) {
            _state.update { it.copy(purchasing = false) }
            return
        }
        for (purchase in purchases) {
            when (purchase.purchaseState) {
                Purchase.PurchaseState.PENDING -> {
                    _state.update {
                        it.copy(
                            purchasing = false,
                            message = "Purchase pending. Coins will be added after Google confirms payment.",
                            isError = false,
                        )
                    }
                }
                Purchase.PurchaseState.PURCHASED -> deliver(purchase)
            }
        }
    }

    private suspend fun deliver(purchase: Purchase) {
        val productId = purchase.products.firstOrNull { allowedProducts.containsKey(it) } ?: return
        if (userId() == null || !processingTokens.add(purchase.purchaseToken)) return
        try {
            val credit = commerce.confirmGoogleCoins(
                GooglePlayCoinRequest(productId = productId, purchaseToken = purchase.purchaseToken),
            )
            _state.update {
                it.copy(
                    balance = credit.balance,
                    purchasing = false,
                    message = "${credit.coins.toString().formatThousands()} coins added to your wallet.",
                    isError = false,
                )
            }
        } catch (error: Exception) {
            _state.update {
                it.copy(
                    purchasing = false,
                    message = "Your purchase is awaiting confirmation. Tap Retry purchases; you will not be charged again. " +
                        error.userMessage(),
                    isError = true,
                )
            }
        } finally {
            processingTokens.remove(purchase.purchaseToken)
        }
    }

    private suspend fun refreshBalance() {
        val wallet = commerce.wallet()
        _state.update { it.copy(balance = wallet.balance) }
    }

    private suspend fun ensureConnected() = connectionMutex.withLock {
        if (billingClient.isReady) return@withLock
        val result = suspendCoroutine<BillingResult> { continuation ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) = continuation.resume(result)
                override fun onBillingServiceDisconnected() = Unit
            })
        }
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            throw BillingFailure(result.debugMessage)
        }
    }

    private suspend fun queryProducts(productIds: List<String>): Pair<BillingResult, QueryProductDetailsResult> {
        val products = productIds.map {
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(it)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        return suspendCoroutine { continuation ->
            billingClient.queryProductDetailsAsync(params) { result, details ->
                continuation.resume(result to details)
            }
        }
    }

    private suspend fun queryPurchases(): Pair<BillingResult, List<Purchase>> {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        return suspendCoroutine { continuation ->
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                continuation.resume(result to purchases)
            }
        }
    }
}

/** Must match the backend's account binding. It contains no email or raw user id. */
fun googlePlayAccountId(userId: String): String = MessageDigest.getInstance("SHA-256")
    .digest(userId.lowercase().toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it) }

private class BillingFailure(message: String) : IOException(message.ifBlank { "Google Play Billing unavailable" })

private fun billingMessage(result: BillingResult): String = when (result.responseCode) {
    BillingClient.BillingResponseCode.BILLING_UNAVAILABLE ->
        "Google Play purchases are not available on this device or account."
    BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
        "This purchase is waiting to be delivered. Tap Retry purchases."
    BillingClient.BillingResponseCode.ITEM_UNAVAILABLE ->
        "This coin pack is not available from Google Play yet."
    BillingClient.BillingResponseCode.NETWORK_ERROR,
    BillingClient.BillingResponseCode.SERVICE_DISCONNECTED,
    BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE ->
        "Google Play is temporarily unavailable. Check your connection and retry."
    else -> result.debugMessage.ifBlank { "Google Play purchase could not be started." }
}

private fun Exception.userMessage(): String = when (this) {
    is ApiException -> userMessage
    is BillingFailure -> message ?: "Google Play Billing unavailable"
    is IOException -> "Check your connection and try again."
    else -> message ?: "Something went wrong. Try again."
}

private fun String.formatThousands(): String = toLongOrNull()?.let { "%,d".format(it) } ?: this
