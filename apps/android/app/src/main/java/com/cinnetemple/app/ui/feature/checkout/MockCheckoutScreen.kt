package com.cinnetemple.app.ui.feature.checkout

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.CreatePurchaseRequest
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassCard
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PosterTile
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Pay-once checkout, mirroring the web /payment/mock-checkout page as a NATIVE
 * branded confirm card. Two entry modes:
 *
 *  1. [authorizationUrl] provided (a POST /v1/purchases already returned
 *     status=pending): if the URL is the mock checkout page its query params
 *     (reference/title/amount/currency) are parsed and rendered natively;
 *     any other URL (real Paystack later) opens in the browser and the
 *     purchase is verified when the user returns.
 *  2. Only [titleId] provided: the screen loads the title, offers an optional
 *     gift (beneficiaryEmail) field, POSTs /v1/purchases itself and then routes
 *     by status ('paid' for free titles -> success; 'pending' -> confirm card).
 *
 * Confirm calls GET /v1/purchases/verify?reference= (polled while 'pending');
 * 'paid' shows the success state with a "Watch now" CTA into watch/{id}.
 */
private sealed interface CheckoutUiState {
    data object Loading : CheckoutUiState
    data class Initiate(val title: TitleDetail) : CheckoutUiState
    data class MockConfirm(
        val reference: String,
        val titleName: String,
        val amountMinor: Long?,
        val currency: String,
    ) : CheckoutUiState
    data class ExternalPayment(val reference: String, val url: String) : CheckoutUiState
    data object Verifying : CheckoutUiState
    data class Success(val isGift: Boolean, val message: String) : CheckoutUiState
    data class Failed(val message: String) : CheckoutUiState
}

@Composable
fun MockCheckoutScreen(nav: NavController, authorizationUrl: String, reference: String, titleId: String) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<CheckoutUiState>(CheckoutUiState.Loading) }
    var giftEmail by rememberSaveable { mutableStateOf("") }
    var wasGift by rememberSaveable { mutableStateOf(false) }
    var browserLaunched by remember { mutableStateOf(false) }
    var leftApp by remember { mutableStateOf(false) }
    var restartKey by remember { mutableIntStateOf(0) }

    fun successState(isGift: Boolean, alreadyEntitled: Boolean = false): CheckoutUiState.Success {
        val message = when {
            isGift -> "Gift sent" + (giftEmail.trim().takeIf { it.isNotEmpty() }?.let { " — $it can now watch." } ?: ".")
            alreadyEntitled -> "You already have a ticket for this title."
            else -> "Your single-view ticket is ready. Pay once, watch once — no subscription."
        }
        return CheckoutUiState.Success(isGift, message)
    }

    /** Parses an authorizationUrl into the native confirm card or a browser hand-off. */
    fun stateForAuthorizationUrl(url: String, fallbackReference: String): CheckoutUiState {
        val uri = runCatching { Uri.parse(url) }.getOrNull()
            ?: return CheckoutUiState.Failed("This checkout link is invalid.")
        val isMock = uri.path?.contains("/payment/mock-checkout") == true
        return if (isMock) {
            val params = runCatching {
                CheckoutUiState.MockConfirm(
                    reference = uri.getQueryParameter("reference").orEmpty().ifEmpty { fallbackReference },
                    titleName = uri.getQueryParameter("title").orEmpty(),
                    amountMinor = uri.getQueryParameter("amount")?.toLongOrNull(),
                    currency = uri.getQueryParameter("currency") ?: "NGN",
                )
            }.getOrNull()
            when {
                params == null || params.reference.isEmpty() ->
                    CheckoutUiState.Failed("The payment reference is missing. Please start the purchase again.")
                else -> params
            }
        } else {
            CheckoutUiState.ExternalPayment(fallbackReference, url)
        }
    }

    /** GET /v1/purchases/verify — idempotent, polled while the PSP reports pending. */
    fun startVerify(purchaseReference: String) {
        if (purchaseReference.isEmpty()) {
            state = CheckoutUiState.Failed("The payment reference is missing. Please start the purchase again.")
            return
        }
        state = CheckoutUiState.Verifying
        scope.launch {
            try {
                var attempts = 0
                while (true) {
                    val result = container.commerceApi.verify(purchaseReference)
                    when (result.status) {
                        "paid" -> {
                            state = successState(isGift = wasGift)
                            return@launch
                        }
                        "failed" -> {
                            state = CheckoutUiState.Failed("Payment failed. You have not been charged — please try again.")
                            return@launch
                        }
                        else -> {
                            if (++attempts >= 10) {
                                state = CheckoutUiState.Failed("Payment is still pending. Please try verifying again in a moment.")
                                return@launch
                            }
                            delay(1_500)
                        }
                    }
                }
            } catch (e: ApiException) {
                state = CheckoutUiState.Failed(e.userMessage)
            } catch (_: Exception) {
                state = CheckoutUiState.Failed("Couldn't reach CinneTemple. Check your connection and try again.")
            }
        }
    }

    /** POST /v1/purchases {titleId, beneficiaryEmail?} and route by status. */
    fun initiatePurchase() {
        val beneficiary = giftEmail.trim().ifEmpty { null }
        wasGift = beneficiary != null
        state = CheckoutUiState.Loading
        scope.launch {
            try {
                val res = container.commerceApi.create(CreatePurchaseRequest(titleId, beneficiary))
                state = when {
                    res.isAlreadyEntitled -> successState(isGift = res.isGift || wasGift, alreadyEntitled = true)
                    res.isPaid -> successState(isGift = res.isGift || wasGift)
                    res.isPending && !res.authorizationUrl.isNullOrBlank() ->
                        stateForAuthorizationUrl(res.authorizationUrl!!, res.reference.orEmpty())
                    else -> CheckoutUiState.Failed("Unexpected purchase state '${res.status}'. Please try again.")
                }
            } catch (e: ApiException) {
                state = CheckoutUiState.Failed(e.userMessage)
            } catch (_: Exception) {
                state = CheckoutUiState.Failed("Couldn't reach CinneTemple. Check your connection and try again.")
            }
        }
    }

    // Entry routing (also re-run by the Failed screen's "Start over").
    LaunchedEffect(restartKey) {
        browserLaunched = false
        leftApp = false
        when {
            authorizationUrl.isNotBlank() -> state = stateForAuthorizationUrl(authorizationUrl, reference)
            titleId.isNotBlank() -> {
                state = CheckoutUiState.Loading
                state = try {
                    CheckoutUiState.Initiate(container.catalogueApi.title(titleId))
                } catch (e: ApiException) {
                    CheckoutUiState.Failed(e.userMessage)
                } catch (_: Exception) {
                    CheckoutUiState.Failed("Couldn't load this title. Check your connection and try again.")
                }
            }
            else -> state = CheckoutUiState.Failed("This checkout link is invalid. Please start the purchase again.")
        }
    }

    // Non-mock authorizationUrl (real Paystack later): hand off to a Chrome
    // Custom Tab once, then auto-verify when the user comes back to the app.
    LaunchedEffect(state) {
        val s = state
        if (s is CheckoutUiState.ExternalPayment && !browserLaunched) {
            browserLaunched = true
            if (!openPaymentPage(context, s.url)) {
                state = CheckoutUiState.Failed("Couldn't open the payment page in a browser.")
            }
        }
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> if (browserLaunched) leftApp = true
                Lifecycle.Event.ON_RESUME -> {
                    val s = state
                    if (leftApp && s is CheckoutUiState.ExternalPayment) {
                        leftApp = false
                        startVerify(s.reference)
                    }
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    fun goWatch() {
        nav.navigate(Routes.watch(titleId)) {
            popUpTo(Routes.MOCK_CHECKOUT) { inclusive = true }
        }
    }

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            CheckoutTopBar(onBack = { nav.popBackStack() })
            Spacer(Modifier.height(28.dp))

            GlassCard(Modifier.fillMaxWidth(), contentPadding = 24.dp) {
                when (val s = state) {
                    CheckoutUiState.Loading -> ProcessingContent("Preparing your checkout…")
                    CheckoutUiState.Verifying -> ProcessingContent("Confirming your payment…")

                    is CheckoutUiState.Initiate -> InitiateContent(
                        title = s.title,
                        giftEmail = giftEmail,
                        onGiftEmailChange = { giftEmail = it },
                        onContinue = { initiatePurchase() },
                        onCancel = { nav.popBackStack() },
                    )

                    is CheckoutUiState.MockConfirm -> MockConfirmContent(
                        titleName = s.titleName,
                        amountMinor = s.amountMinor,
                        currency = s.currency,
                        onConfirm = { startVerify(s.reference) },
                        onCancel = { nav.popBackStack() },
                    )

                    is CheckoutUiState.ExternalPayment -> ExternalPaymentContent(
                        onVerify = { startVerify(s.reference) },
                        onCancel = { nav.popBackStack() },
                    )

                    is CheckoutUiState.Success -> SuccessContent(
                        isGift = s.isGift,
                        message = s.message,
                        canWatch = titleId.isNotBlank() && !s.isGift,
                        onWatch = { goWatch() },
                        onDone = { nav.popBackStack() },
                    )

                    is CheckoutUiState.Failed -> FailedContent(
                        message = s.message,
                        canRetry = authorizationUrl.isNotBlank() || titleId.isNotBlank(),
                        onRetry = { restartKey++ },
                        onClose = { nav.popBackStack() },
                    )
                }
            }
        }
    }
}

/**
 * Opens a real-PSP checkout page (Paystack later) in a dark-themed Chrome
 * Custom Tab, falling back to a plain ACTION_VIEW intent when no Custom
 * Tabs-capable browser is installed. Returns false only if nothing can open it.
 */
private fun openPaymentPage(context: Context, url: String): Boolean {
    val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
    val customTab = runCatching {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(0xFF09090B.toInt())
                    .setNavigationBarColor(0xFF09090B.toInt())
                    .build(),
            )
            .build()
    }.getOrNull()
    if (customTab != null && runCatching { customTab.launchUrl(context, uri) }.isSuccess) return true
    return runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }.isSuccess
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

@Composable
private fun CheckoutTopBar(onBack: () -> Unit) {
    Box(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .size(40.dp)
                .liquidGlass(radius = 20.dp)
                .clickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = Color.White,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(
            "Checkout",
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.Center),
        )
    }
}

@Composable
private fun ProcessingContent(message: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        CircularProgressIndicator(color = CtColors.Brand)
        Text(message, color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}

/** Pre-purchase step: title summary, optional gift email, pay CTA. */
@Composable
private fun InitiateContent(
    title: TitleDetail,
    giftEmail: String,
    onGiftEmailChange: (String) -> Unit,
    onContinue: () -> Unit,
    onCancel: () -> Unit,
) {
    val isFree = title.priceMinor <= 0
    val gifting = giftEmail.isNotBlank()
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Filled.ConfirmationNumber,
            contentDescription = null,
            tint = CtColors.IndigoLight,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("Confirm your purchase", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "One-time payment — watch once, no subscription.",
            color = CtColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))

        OrderSummaryRow(
            titleName = title.title,
            priceText = Money.priceLabel(title.priceMinor, title.currency),
            poster = { PosterTile(id = title.id, title = title.title, posterUrl = title.posterUrl, width = 56.dp) },
        )

        Spacer(Modifier.height(20.dp))
        GlassField(
            label = "Gift to a friend (optional)",
            value = giftEmail,
            onValueChange = onGiftEmailChange,
            placeholder = "friend@example.com",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Your friend must already have a CinneTemple account. The single-view ticket goes to them, not you.",
            color = CtColors.TextSecondary,
            fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(20.dp))
        PrimaryButton(
            text = when {
                isFree && gifting -> "Send free ticket"
                isFree -> "Get free ticket"
                gifting -> "Gift ${Money.formatMinor(title.priceMinor, title.currency)}"
                else -> "Pay ${Money.formatMinor(title.priceMinor, title.currency)}"
            },
            onClick = onContinue,
        )
        Spacer(Modifier.height(10.dp))
        GlassButton("Cancel", onClick = onCancel)
    }
}

/** The native mock-checkout confirm card (web /payment/mock-checkout parity). */
@Composable
private fun MockConfirmContent(
    titleName: String,
    amountMinor: Long?,
    currency: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val priceText = amountMinor?.let { Money.formatMinor(it, currency) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Filled.ConfirmationNumber,
            contentDescription = null,
            tint = CtColors.IndigoLight,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("Confirm your purchase", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "One-time payment — watch ${titleName.ifEmpty { "this title" }} once, then it's yours to view. No subscription.",
            color = CtColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))

        OrderSummaryRow(titleName = titleName.ifEmpty { "This title" }, priceText = priceText)

        Spacer(Modifier.height(20.dp))
        PrimaryButton(
            text = if (priceText != null) "Pay $priceText" else "Confirm purchase",
            onClick = onConfirm,
        )
        Spacer(Modifier.height(10.dp))
        GlassButton("Cancel", onClick = onCancel)
    }
}

/** Shared order line: title + "Single view · pay once" left, bold price right. */
@Composable
private fun OrderSummaryRow(
    titleName: String,
    priceText: String?,
    poster: (@Composable () -> Unit)? = null,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.04f), shape)
            .border(1.dp, Color.White.copy(alpha = 0.10f), shape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (poster != null) {
            poster()
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                titleName,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text("Single view · pay once", color = CtColors.TextSecondary, fontSize = 11.sp)
        }
        if (priceText != null) {
            Spacer(Modifier.width(12.dp))
            Text(priceText, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** Real-PSP hand-off (Paystack later): browser opened, verify on return. */
@Composable
private fun ExternalPaymentContent(onVerify: () -> Unit, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.AutoMirrored.Filled.OpenInNew,
            contentDescription = null,
            tint = CtColors.IndigoLight,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("Complete your payment", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "We opened the secure payment page in your browser. Finish there, then return to CinneTemple — we'll confirm your ticket automatically.",
            color = CtColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        PrimaryButton("I've completed payment", onClick = onVerify)
        Spacer(Modifier.height(10.dp))
        GlassButton("Cancel", onClick = onCancel)
    }
}

@Composable
private fun SuccessContent(
    isGift: Boolean,
    message: String,
    canWatch: Boolean,
    onWatch: () -> Unit,
    onDone: () -> Unit,
) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF22C55E),
            modifier = Modifier.size(56.dp),
        )
        Spacer(Modifier.height(14.dp))
        Text(
            if (isGift) "Gift sent" else "Ticket ready",
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        Text(message, color = CtColors.TextSecondary, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        if (canWatch) {
            PrimaryButton("Watch now", onClick = onWatch)
            Spacer(Modifier.height(10.dp))
        }
        GlassButton("Done", onClick = onDone)
    }
}

@Composable
private fun FailedContent(
    message: String,
    canRetry: Boolean,
    onRetry: () -> Unit,
    onClose: () -> Unit,
) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        ErrorBanner(message)
        Spacer(Modifier.height(20.dp))
        if (canRetry) {
            PrimaryButton("Try again", onClick = onRetry)
            Spacer(Modifier.height(10.dp))
        }
        GlassButton("Close", onClick = onClose)
    }
}
