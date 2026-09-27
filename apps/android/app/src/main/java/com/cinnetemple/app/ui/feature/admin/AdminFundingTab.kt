package com.cinnetemple.app.ui.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.CreatePoolRequest
import com.cinnetemple.app.core.network.dto.FundingPool
import com.cinnetemple.app.core.network.dto.PayoutPlan
import com.cinnetemple.app.core.network.dto.PayoutRequest
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.IndigoGlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Studio → Funding (web components/admin/FundingTab.tsx parity). Open a pool
 * for a film, close it, and set the payout: the live preview shows ₦ per coin
 * (payout ÷ pooled coins) and every backer's share before anything is
 * credited. Payout and cancel are final and pay backers in coins.
 */
@Composable
internal fun AdminFundingTab() {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var pools by remember { mutableStateOf<List<FundingPool>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            pools = container.adminApi.fundingPools()
            error = null
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
    }

    LaunchedEffect(Unit) { load() }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "create") { CreatePoolCard(onCreated = { scope.launch { load() } }) }
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        val list = pools
        when {
            list == null && error == null -> item(key = "spinner") { CenteredSpinner() }
            list != null && list.isEmpty() -> item(key = "empty") { EmptyNote("No funding pools yet.") }
            list != null -> items(list, key = { it.id }) { pool ->
                PoolAdminRow(pool = pool, onChanged = { scope.launch { load() } })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

@Composable
private fun CreatePoolCard(onCreated: () -> Unit) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var goal by remember { mutableStateOf("") }
    var closesText by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val closesIso = parseLocalToIso(closesText)
    val closesInvalid = closesText.isNotBlank() && closesIso == null

    fun submit() {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                container.adminApi.createPool(
                    CreatePoolRequest(
                        name = name.trim(),
                        description = description.trim().ifEmpty { null },
                        goalCoins = goal.toLongOrNull()?.takeIf { it > 0 },
                        closesAt = closesIso,
                    ),
                )
                name = ""
                description = ""
                goal = ""
                closesText = ""
                onCreated()
            } catch (e: Exception) {
                error = e.adminFriendlyMessage()
            }
            busy = false
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("New funding pool", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        GlassField(
            label = "",
            value = name,
            onValueChange = { name = it.take(120) },
            placeholder = "Film name",
        )
        GlassField(
            label = "",
            value = description,
            onValueChange = { description = it.take(2000) },
            placeholder = "What backers are funding (optional)",
            singleLine = false,
        )
        GlassField(
            label = "Goal in coins (₦) — optional cap",
            value = goal,
            onValueChange = { goal = it.filter { c -> c.isDigit() }.take(10) },
            placeholder = "e.g. 5000000",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        goal.toLongOrNull()?.let {
            Text("= ${Money.naira(it)}", color = CtColors.TextSecondary, fontSize = 11.sp)
        }
        GlassField(
            label = "Closes — optional (YYYY-MM-DD HH:MM, your time)",
            value = closesText,
            onValueChange = { closesText = it.take(16) },
            placeholder = "2026-12-31 23:59",
        )
        if (closesInvalid) {
            Text("Use the format 2026-12-31 23:59", color = CtColors.SignOutText, fontSize = 11.sp)
        }
        error?.let { ErrorBanner(it) }
        IndigoGlassButton(
            if (busy) "Creating…" else "Open pool",
            onClick = { submit() },
            enabled = !busy && name.trim().length >= 2 && !closesInvalid,
        )
    }
}

// ---------------------------------------------------------------------------
// Pool row: status, close, cancel & refund, payout panel
// ---------------------------------------------------------------------------

private fun poolStatusColor(status: String): Color = when (status) {
    "OPEN" -> AdminGreen
    "CLOSED" -> CtColors.TextSecondary
    "PAID_OUT" -> CtColors.IndigoLight
    "CANCELLED" -> CtColors.SignOutText
    else -> CtColors.TextSecondary
}

private fun backers(n: Int): String = if (n == 1) "1 backer" else "${Money.grouped(n.toLong())} backers"

@Composable
private fun PoolAdminRow(pool: FundingPool, onChanged: () -> Unit) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var payoutOpen by remember(pool.id) { mutableStateOf(false) }
    var confirm by remember(pool.id) { mutableStateOf<String?>(null) } // "close" | "cancel"
    var busy by remember(pool.id) { mutableStateOf(false) }
    var error by remember(pool.id) { mutableStateOf<String?>(null) }
    val settleable = pool.status == "OPEN" || pool.status == "CLOSED"

    fun act() {
        val action = confirm ?: return
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                if (action == "close") container.adminApi.closePool(pool.id) else container.adminApi.cancelPool(pool.id)
                confirm = null
                onChanged()
            } catch (e: Exception) {
                error = e.adminFriendlyMessage()
            }
            busy = false
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 14.dp)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                pool.name,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(8.dp))
            AdminPill(pool.status.replace('_', ' '), poolStatusColor(pool.status))
        }
        Spacer(Modifier.height(4.dp))
        val summary = buildString {
            append("${Money.naira(pool.totalCoins)} pooled")
            pool.goalCoins?.let { append(" of ${Money.naira(it)}") }
            append(" · ${backers(pool.backers)}")
            if (pool.status == "PAID_OUT" && pool.nairaPerCoin != null) {
                append(" · paid ${Money.naira(pool.payoutCoins ?: 0L)} (₦${pool.nairaPerCoin}/coin)")
            }
        }
        Text(summary, color = CtColors.TextSecondary, fontSize = 12.sp)
        pool.closesAt?.let {
            Text("Closes ${formatIsoShort(it)}", color = CtColors.TextSecondary, fontSize = 11.sp)
        }

        if (settleable) {
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FundingChip(if (payoutOpen) "Hide payout" else "Set payout", CtColors.IndigoBright) {
                    payoutOpen = !payoutOpen
                }
                if (pool.status == "OPEN") {
                    FundingChip("Close funding", Color.White.copy(alpha = 0.8f)) {
                        error = null
                        confirm = "close"
                    }
                }
                FundingChip("Cancel & refund", CtColors.SignOutText) {
                    error = null
                    confirm = "cancel"
                }
            }
        }
        if (payoutOpen && settleable) {
            PayoutPanel(pool = pool, onDone = onChanged)
        }
    }

    confirm?.let { action ->
        val isClose = action == "close"
        AlertDialog(
            onDismissRequest = { if (!busy) confirm = null },
            containerColor = CtColors.BgSurface,
            title = {
                Text(if (isClose) "Close ${pool.name}?" else "Cancel ${pool.name}?", color = Color.White)
            },
            text = {
                Column {
                    Text(
                        if (isClose) {
                            "No more coins can go in and backers can no longer claim refunds. " +
                                "You can still pay out or cancel."
                        } else {
                            (if (pool.backers == 1) "The 1 backer gets" else "All ${pool.backers} backers get") +
                                " their ${Money.naira(pool.totalCoins)} back as coins. This is final."
                        },
                        color = CtColors.TextSecondary,
                    )
                    error?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = CtColors.SignOutText, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { act() }, enabled = !busy) {
                    if (busy) {
                        CircularProgressIndicator(
                            Modifier.width(18.dp).height(18.dp),
                            color = CtColors.IndigoLight,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(
                            if (isClose) "Close funding" else "Cancel & refund",
                            color = if (isClose) CtColors.IndigoLight else CtColors.SignOutText,
                        )
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }, enabled = !busy) {
                    Text("Back", color = CtColors.TextSecondary)
                }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Payout: debounced live preview + final confirm
// ---------------------------------------------------------------------------

@Composable
private fun PayoutPanel(pool: FundingPool, onDone: () -> Unit) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var amount by remember(pool.id) { mutableStateOf("") }
    var plan by remember(pool.id) { mutableStateOf<PayoutPlan?>(null) }
    var error by remember(pool.id) { mutableStateOf<String?>(null) }
    var busy by remember(pool.id) { mutableStateOf(false) }
    var confirming by remember(pool.id) { mutableStateOf(false) }

    // Live preview, recomputed as the admin types. A new keystroke cancels the
    // pending delay, so only the settled amount hits the API (300ms debounce).
    LaunchedEffect(pool.id, amount) {
        plan = null
        val coins = amount.toLongOrNull() ?: return@LaunchedEffect
        delay(300)
        try {
            plan = container.adminApi.previewPayout(pool.id, coins)
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
    }

    fun pay() {
        val coins = amount.toLongOrNull() ?: return
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                container.adminApi.payout(pool.id, PayoutRequest(coins))
                confirming = false
                onDone()
            } catch (e: Exception) {
                error = e.adminFriendlyMessage()
            }
            busy = false
        }
    }

    Column(
        Modifier
            .padding(top = 12.dp)
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.20f), RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        GlassField(
            label = "Total payout to backers (coins = ₦)",
            value = amount,
            onValueChange = {
                error = null
                amount = it.filter { c -> c.isDigit() }.take(10)
            },
            placeholder = "e.g. 7500000",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        plan?.let { p ->
            Text(
                "${Money.naira(p.payoutCoins)} ÷ ${Money.coins(p.totalCoins)} = ₦${p.nairaPerCoin} per coin",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (p.backers.isEmpty()) {
                Text("No backers to pay.", color = CtColors.TextSecondary, fontSize = 12.sp)
            } else {
                PayoutTable(p)
            }
        }
        error?.let { ErrorBanner(it) }
        val ready = plan?.backers?.isNotEmpty() == true
        IndigoGlassButton("Pay out", onClick = { confirming = true }, enabled = ready && !busy)
    }

    val p = plan
    if (confirming && p != null) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirming = false },
            containerColor = CtColors.BgSurface,
            title = { Text("Pay out ${pool.name}?", color = Color.White) },
            text = {
                Column {
                    Text(
                        "${Money.naira(p.payoutCoins)} will be credited as coins to ${backers(p.backers.size)} " +
                            "at ₦${p.nairaPerCoin} per coin. This is final.",
                        color = CtColors.TextSecondary,
                    )
                    error?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = CtColors.SignOutText, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { pay() }, enabled = !busy) {
                    if (busy) {
                        CircularProgressIndicator(
                            Modifier.width(18.dp).height(18.dp),
                            color = CtColors.IndigoLight,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Pay out", color = CtColors.IndigoLight)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }, enabled = !busy) {
                    Text("Back", color = CtColors.TextSecondary)
                }
            },
        )
    }
}

@Composable
private fun PayoutTable(plan: PayoutPlan) {
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, Color.White.copy(alpha = 0.10f), shape),
    ) {
        PayoutTableRow("Backer", "Stake", "Gets", header = true)
        // Bounded height so this scrolls inside the admin LazyColumn.
        Column(Modifier.heightIn(max = 224.dp).verticalScroll(rememberScrollState())) {
            plan.backers.forEach { b ->
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.05f)))
                PayoutTableRow(b.name, Money.grouped(b.coins), Money.grouped(b.payoutCoins))
            }
        }
    }
}

@Composable
private fun PayoutTableRow(name: String, stake: String, gets: String, header: Boolean = false) {
    val base = if (header) CtColors.TextSecondary else Color.White.copy(alpha = 0.8f)
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (header) CtColors.BgSurface else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(name, color = base, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(stake, color = base, fontSize = 12.sp, textAlign = TextAlign.End, modifier = Modifier.width(88.dp))
        Text(
            gets,
            color = if (header) base else AdminGreen,
            fontSize = 12.sp,
            fontWeight = if (header) FontWeight.Medium else FontWeight.SemiBold,
            textAlign = TextAlign.End,
            modifier = Modifier.width(88.dp),
        )
    }
}

/** Pill action (min 40dp tall for thumbs), tinted like the web FundingTab buttons. */
@Composable
private fun FundingChip(text: String, color: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Box(
        Modifier
            .heightIn(min = 40.dp)
            .clip(shape)
            .background(color.copy(alpha = 0.14f))
            .border(1.dp, color.copy(alpha = 0.30f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
