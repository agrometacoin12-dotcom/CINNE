package com.cinnetemple.app.ui.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.CoinLedgerEntry
import com.cinnetemple.app.core.network.dto.TopupRequest
import com.cinnetemple.app.core.network.dto.TransferRequest
import com.cinnetemple.app.core.network.dto.WalletSummary
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassCard
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.feature.admin.formatIsoShort
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Coin wallet (web /wallet parity). 1 coin = ₦1. Buy coins through the same
 * checkout flow as tickets (mock checkout / Paystack + verify), send coins to
 * another CinneTemple account by email, and see every movement.
 */

private val QUICK_BUYS = listOf(1_000L, 2_500L, 5_000L, 10_000L)
private const val MIN_TOPUP = 100L
private const val MAX_NOTE = 140

/** Same labels as the web wallet's KIND_LABEL. */
private fun kindLabel(kind: String): String = when (kind) {
    "TOPUP" -> "Bought coins"
    "POOL_FUND" -> "Funded"
    "POOL_REFUND" -> "Refund from"
    "POOL_PAYOUT" -> "Payout from"
    "TRANSFER_OUT" -> "Sent to"
    "TRANSFER_IN" -> "Received from"
    else -> "Coins"
}

private fun entryTitle(e: CoinLedgerEntry): String {
    val who = e.poolName ?: e.counterparty
    return if (who != null) "${kindLabel(e.kind)} $who" else kindLabel(e.kind)
}

/** Digits only, capped so toLong() can't overflow. */
private fun digitsOnly(text: String): String = text.filter { it.isDigit() }.take(10)

private fun Throwable.walletMessage(fallback: String): String =
    (this as? ApiException)?.userMessage ?: fallback

private data class Notice(val success: Boolean, val text: String)

@Composable
fun WalletScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var data by remember { mutableStateOf<WalletSummary?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var buyAmount by rememberSaveable { mutableStateOf("") }
    var buying by remember { mutableStateOf(false) }
    var buyError by remember { mutableStateOf<String?>(null) }

    var to by rememberSaveable { mutableStateOf("") }
    var sendAmount by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    // One key per send attempt; a retry after a network error reuses it so the
    // server dedupes, and a fresh one is minted after a successful send.
    var sendKey by rememberSaveable { mutableStateOf(Money.newIdempotencyKey()) }
    var sending by remember { mutableStateOf(false) }
    var sendNotice by remember { mutableStateOf<Notice?>(null) }

    suspend fun load() {
        try {
            data = container.walletApi.wallet()
            loadError = null
        } catch (e: Exception) {
            loadError = e.walletMessage("Could not load your wallet")
        }
    }

    // Re-runs whenever the screen re-enters composition (e.g. back from checkout).
    LaunchedEffect(Unit) { load() }

    fun buy(coins: Long?) {
        if (buying) return
        buyError = null
        if (coins == null || coins < MIN_TOPUP) {
            buyError = "Buy at least ${Money.coins(MIN_TOPUP)}"
            return
        }
        buying = true
        scope.launch {
            try {
                val start = container.walletApi.buyCoins(TopupRequest(coins))
                val url = start.authorizationUrl
                if (!url.isNullOrBlank()) {
                    // Exactly the ticket checkout hand-off; `coin_` reference => coin copy + wallet verify.
                    nav.navigate(Routes.mockCheckout(authorizationUrl = url, reference = start.reference, titleId = ""))
                } else {
                    load()
                }
            } catch (e: Exception) {
                buyError = e.walletMessage("Could not start payment")
            }
            buying = false
        }
    }

    fun send() {
        if (sending) return
        sendNotice = null
        val coins = sendAmount.toLongOrNull()
        if (coins == null || coins < 1) {
            sendNotice = Notice(false, "Enter a whole number of coins")
            return
        }
        sending = true
        scope.launch {
            try {
                val r = container.walletApi.sendCoins(
                    TransferRequest(
                        recipientEmail = to.trim(),
                        coins = coins,
                        idempotencyKey = sendKey,
                        note = note.trim().ifEmpty { null },
                    ),
                )
                sendNotice = Notice(true, "Sent ${Money.coins(r.coins)} to ${r.recipient}")
                to = ""
                sendAmount = ""
                note = ""
                sendKey = Money.newIdempotencyKey() // next send is a new transfer
                load()
            } catch (e: Exception) {
                sendNotice = Notice(false, e.walletMessage("Could not send coins"))
            }
            sending = false
        }
    }

    val balance = data?.balance ?: 0L

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(12.dp))
            GlassBackButton(onClick = { nav.popBackStack() })
            Spacer(Modifier.height(16.dp))
            Text("Wallet", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))

            loadError?.let {
                ErrorBanner(it)
                Spacer(Modifier.height(12.dp))
            }

            // --- Balance ---
            GlassCard(Modifier.fillMaxWidth(), tint = CtColors.Brand, contentPadding = 20.dp) {
                Column(Modifier.fillMaxWidth()) {
                    Text("Balance", color = Color.White.copy(alpha = 0.6f), fontSize = 13.sp)
                    Spacer(Modifier.height(4.dp))
                    if (data == null && loadError == null) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.padding(vertical = 8.dp),
                        )
                    } else {
                        Text(
                            if (data != null) Money.coins(balance) else "—",
                            color = Color.White,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(2.dp))
                    if (data != null) {
                        Text(
                            "Worth ${Money.naira(balance)} · 1 coin = ₦1",
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 13.sp,
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    GlassButton("Fund a film", onClick = { nav.navigate(Routes.FUND) })
                }
            }

            Spacer(Modifier.height(20.dp))

            // --- Buy coins ---
            SectionCard {
                SectionTitle("Buy coins", "Pay with card, transfer or USSD via Paystack.")
                Spacer(Modifier.height(14.dp))
                QUICK_BUYS.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { amount ->
                            GlassButton(
                                Money.naira(amount),
                                onClick = { buy(amount) },
                                enabled = !buying,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }
                Spacer(Modifier.height(4.dp))
                GlassField(
                    label = "Other amount (coins)",
                    value = buyAmount,
                    onValueChange = { buyAmount = digitsOnly(it) },
                    placeholder = "e.g. 7500",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                )
                Spacer(Modifier.height(12.dp))
                PrimaryButton(
                    text = buyAmount.toLongOrNull()?.let { "Pay ${Money.naira(it)}" } ?: "Pay",
                    onClick = { buy(buyAmount.toLongOrNull()) },
                    enabled = buyAmount.isNotEmpty(),
                    loading = buying,
                )
                buyError?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = CtColors.SignOutText, fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(20.dp))

            // --- Send coins ---
            SectionCard {
                SectionTitle(
                    "Send coins",
                    "To anyone with a CinneTemple account. Transfers are instant and can't be reversed.",
                )
                Spacer(Modifier.height(14.dp))
                GlassField(
                    label = "Their CinneTemple email",
                    value = to,
                    onValueChange = {
                        to = it.trim()
                        sendKey = Money.newIdempotencyKey() // different send → new key
                    },
                    placeholder = "friend@example.com",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
                GlassField(
                    label = "Coins",
                    value = sendAmount,
                    onValueChange = {
                        sendAmount = digitsOnly(it)
                        sendKey = Money.newIdempotencyKey()
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                )
                sendAmount.toLongOrNull()?.let {
                    Spacer(Modifier.height(4.dp))
                    Text("= ${Money.naira(it)}", color = CtColors.TextSecondary, fontSize = 12.sp)
                }
                Spacer(Modifier.height(12.dp))
                GlassField(
                    label = "Note (optional)",
                    value = note,
                    onValueChange = { note = it.take(MAX_NOTE) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                )
                sendNotice?.let {
                    Spacer(Modifier.height(12.dp))
                    if (it.success) SuccessBanner(it.text) else ErrorBanner(it.text)
                }
                Spacer(Modifier.height(14.dp))
                PrimaryButton(
                    text = "Send " + (sendAmount.toLongOrNull()?.let { Money.coins(it) } ?: "coins"),
                    onClick = { send() },
                    enabled = to.isNotBlank() && sendAmount.isNotEmpty(),
                    loading = sending,
                )
            }

            Spacer(Modifier.height(24.dp))

            // --- Activity ---
            Text("Activity", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            val entries = data?.entries
            when {
                entries == null -> Unit
                entries.isEmpty() -> Box(
                    Modifier
                        .fillMaxWidth()
                        .liquidGlass(radius = 14.dp, elevation = 0.dp)
                        .padding(vertical = 28.dp, horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "No coin activity yet. Buy some coins to fund a film.",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                    )
                }
                else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    entries.forEach { ActivityRow(it) }
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun SectionCard(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(18.dp),
    ) { content() }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Text(title, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(4.dp))
    Text(subtitle, color = CtColors.TextSecondary, fontSize = 13.sp)
}

@Composable
private fun ActivityRow(e: CoinLedgerEntry) {
    Row(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 12.dp, elevation = 0.dp)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                entryTitle(e),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                formatIsoShort(e.createdAt) + (e.note?.let { " · “$it”" } ?: ""),
                color = CtColors.TextSecondary,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            (if (e.delta > 0) "+" else "−") + Money.grouped(kotlin.math.abs(e.delta)),
            color = if (e.delta > 0) CoinGreen else Color.White.copy(alpha = 0.8f),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

/** Credits — web emerald-300. */
private val CoinGreen = Color(0xFF6EE7B7)
