package com.cinnetemple.app.ui.feature.fund

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.ContributeRequest
import com.cinnetemple.app.core.network.dto.FundingPool
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.feature.admin.formatIsoShort
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

private data class FundNotice(val success: Boolean, val text: String)

/**
 * One funding pool (web /fund?id= parity): progress vs goal, your stake, fund
 * it from your wallet, and claim your whole stake back as coins while it's
 * OPEN (inline confirm). Paid-out pools show ₦ per coin.
 */
@Composable
fun FundPoolScreen(nav: NavController, poolId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var pool by remember { mutableStateOf<FundingPool?>(null) }
    var balance by remember { mutableStateOf<Long?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    var amount by rememberSaveable { mutableStateOf("") }
    // One key per fund attempt; minted fresh after a successful contribution.
    var fundKey by rememberSaveable { mutableStateOf(Money.newIdempotencyKey()) }
    var busy by remember { mutableStateOf<String?>(null) } // "fund" | "refund"
    var notice by remember { mutableStateOf<FundNotice?>(null) }
    var confirmRefund by remember { mutableStateOf(false) }

    suspend fun refreshBalance() {
        runCatching { container.walletApi.wallet() }.onSuccess { balance = it.balance }
    }

    // Also re-runs when coming back from the wallet after buying coins.
    LaunchedEffect(poolId) {
        try {
            pool = container.fundingApi.myPool(poolId)
            loadError = null
        } catch (e: Exception) {
            loadError = e.fundMessage("Could not load this film")
        }
        refreshBalance()
    }

    fun fund() {
        if (busy != null) return
        notice = null
        val coins = amount.toLongOrNull()
        if (coins == null || coins < 1) {
            notice = FundNotice(false, "Enter a whole number of coins")
            return
        }
        busy = "fund"
        scope.launch {
            try {
                val updated = container.fundingApi.contribute(poolId, ContributeRequest(coins, fundKey))
                pool = updated
                notice = FundNotice(true, "You put ${Money.coins(coins)} into ${updated.name.ifBlank { "this film" }}")
                amount = ""
                fundKey = Money.newIdempotencyKey()
                refreshBalance()
            } catch (e: Exception) {
                notice = FundNotice(false, e.fundMessage("Could not fund this film"))
            }
            busy = null
        }
    }

    fun refund() {
        if (busy != null) return
        notice = null
        busy = "refund"
        scope.launch {
            try {
                val r = container.fundingApi.claimRefund(poolId)
                pool = r.pool
                confirmRefund = false
                notice = FundNotice(true, "${Money.coins(r.refundedCoins)} returned to your wallet")
                refreshBalance()
            } catch (e: Exception) {
                notice = FundNotice(false, e.fundMessage("Could not process your refund"))
            }
            busy = null
        }
    }

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

            val p = pool
            when {
                loadError != null && p == null -> ErrorBanner(loadError.orEmpty())
                p == null -> Box(
                    Modifier.fillMaxWidth().padding(vertical = 64.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = CtColors.Brand)
                }
                else -> PoolDetailContent(
                    pool = p,
                    balance = balance,
                    amount = amount,
                    onAmountChange = {
                        amount = it.filter { c -> c.isDigit() }.take(10)
                        fundKey = Money.newIdempotencyKey() // different amount → new key
                    },
                    busy = busy,
                    notice = notice,
                    confirmRefund = confirmRefund,
                    onAskRefund = { confirmRefund = true },
                    onCancelRefund = { confirmRefund = false },
                    onRefund = { refund() },
                    onFund = { fund() },
                    onBuyCoins = { nav.navigate(Routes.WALLET) },
                )
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun PoolDetailContent(
    pool: FundingPool,
    balance: Long?,
    amount: String,
    onAmountChange: (String) -> Unit,
    busy: String?,
    notice: FundNotice?,
    confirmRefund: Boolean,
    onAskRefund: () -> Unit,
    onCancelRefund: () -> Unit,
    onRefund: () -> Unit,
    onFund: () -> Unit,
    onBuyCoins: () -> Unit,
) {
    Row(verticalAlignment = Alignment.Top) {
        Text(
            pool.name,
            color = Color.White,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            poolStatusLabel(pool.status),
            color = Color.White.copy(alpha = 0.75f),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier
                .padding(top = 6.dp)
                .background(Color.White.copy(alpha = 0.10f), RoundedCornerShape(50))
                .padding(horizontal = 12.dp, vertical = 5.dp),
        )
    }
    pool.description?.takeIf { it.isNotBlank() }?.let {
        Spacer(Modifier.height(10.dp))
        Text(it, color = Color.White.copy(alpha = 0.72f), fontSize = 14.sp, lineHeight = 20.sp)
    }

    // --- Progress ---
    Spacer(Modifier.height(20.dp))
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(18.dp),
    ) {
        PoolProgress(pool)
        val closesAt = pool.closesAt
        if (closesAt != null && pool.isOpen) {
            Spacer(Modifier.height(10.dp))
            Text("Closes ${formatIsoShort(closesAt)}", color = CtColors.TextSecondary, fontSize = 12.sp)
        }
        val perCoin = pool.nairaPerCoin
        if (pool.isPaidOut && perCoin != null) {
            Spacer(Modifier.height(14.dp))
            Text(
                "Paid out ${Money.naira(pool.payoutCoins ?: 0L)} · each coin earned ₦$perCoin",
                color = FundGreen,
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(FundGreen.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            )
        }
    }

    // --- My stake ---
    val stake = pool.myStake
    if (stake != null && stake.contributedCoins > 0) {
        Spacer(Modifier.height(14.dp))
        val shape = RoundedCornerShape(16.dp)
        Column(
            Modifier
                .fillMaxWidth()
                .background(CtColors.IndigoLight.copy(alpha = 0.10f), shape)
                .border(1.dp, CtColors.IndigoLight.copy(alpha = 0.30f), shape)
                .padding(18.dp),
        ) {
            Text("Your stake", color = Color.White.copy(alpha = 0.6f), fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Text(Money.coins(stake.coins), color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            if (stake.refundedCoins > 0) {
                Spacer(Modifier.height(2.dp))
                Text(
                    "${Money.coins(stake.refundedCoins)} refunded to your wallet",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                )
            }
            stake.payoutCoins?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Payout: ${Money.coins(it)} credited to your wallet",
                    color = FundGreen,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (pool.isOpen && stake.coins > 0) {
                Spacer(Modifier.height(14.dp))
                if (confirmRefund) {
                    Text(
                        "Return ${Money.coins(stake.coins)} to your wallet?",
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GlassButton(
                            "Keep it in",
                            onClick = onCancelRefund,
                            enabled = busy == null,
                            modifier = Modifier.weight(1f),
                        )
                        PrimaryButton(
                            "Yes, refund",
                            onClick = onRefund,
                            loading = busy == "refund",
                            enabled = busy == null || busy == "refund",
                            modifier = Modifier.weight(1f),
                        )
                    }
                } else {
                    GlassButton("Claim refund (as coins)", onClick = onAskRefund, enabled = busy == null)
                }
            }
        }
    }

    notice?.let {
        Spacer(Modifier.height(14.dp))
        if (it.success) SuccessBanner(it.text) else ErrorBanner(it.text)
    }

    // --- Fund form ---
    if (pool.isOpen) {
        Spacer(Modifier.height(14.dp))
        val coins = amount.toLongOrNull()
        val short = balance != null && coins != null && coins > balance
        Column(
            Modifier
                .fillMaxWidth()
                .liquidGlass(radius = 16.dp)
                .padding(18.dp),
        ) {
            Text("Put coins in", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            GlassField(
                label = "Coins",
                value = amount,
                onValueChange = onAmountChange,
                placeholder = "e.g. 5000",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            )
            Spacer(Modifier.height(6.dp))
            when {
                short -> Text("Not enough coins in your wallet", color = CtColors.SignOutText, fontSize = 12.sp)
                balance != null -> Text(
                    "Wallet: ${Money.coins(balance)}",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                )
            }
            Spacer(Modifier.height(12.dp))
            PrimaryButton(
                text = "Fund" + (coins?.let { " ${Money.coins(it)}" } ?: ""),
                onClick = onFund,
                enabled = amount.isNotEmpty() && !short && (busy == null || busy == "fund"),
                loading = busy == "fund",
            )
            if (short || balance == 0L) {
                Spacer(Modifier.height(10.dp))
                GlassButton("Buy coins", onClick = onBuyCoins)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "You can claim your coins back while funding is open. Refunds always return as coins.",
                color = CtColors.TextSecondary,
                fontSize = 12.sp,
            )
        }
    }
}
