package com.cinnetemple.app.ui.feature.admin

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.AdminProducerWithdrawal
import com.cinnetemple.app.core.network.dto.MarkWithdrawalPaidRequest
import com.cinnetemple.app.core.network.dto.RejectWithdrawalRequest
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Studio → Payouts (web components/admin/PayoutsTab.tsx parity). Producer
 * withdrawal requests (already confirmed by the producer with an emailed
 * code). Send the bank transfer, then mark it paid with the transfer
 * reference — the producer is emailed either way.
 */

private val PAYOUT_FILTERS = listOf(
    "REQUESTED" to "To pay",
    "PAID" to "Paid",
    "REJECTED" to "Declined",
)

private fun payoutStatusLabel(status: String): String =
    PAYOUT_FILTERS.firstOrNull { it.first == status }?.second ?: status

private fun payoutStatusColor(status: String): Color = when (status) {
    "REQUESTED" -> AdminAmber
    "PAID" -> AdminGreen
    "REJECTED" -> CtColors.SignOutText
    else -> CtColors.TextSecondary
}

@Composable
internal fun AdminPayoutsTab() {
    val container = LocalAppContainer.current
    var filter by remember { mutableStateOf("REQUESTED") }
    var reloadKey by remember { mutableIntStateOf(0) }
    var rows by remember { mutableStateOf<List<AdminProducerWithdrawal>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(filter, reloadKey) {
        error = null
        try {
            rows = container.adminApi.producerWithdrawals(filter)
        } catch (e: Exception) {
            error = e.friendlyOr("Could not load withdrawals")
        }
    }

    val list = rows
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "filters") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    PAYOUT_FILTERS.forEach { (key, label) ->
                        PayoutFilterChip(label, active = filter == key) {
                            if (filter != key) {
                                rows = null // don't show the previous filter's rows under the new chip
                                filter = key
                            }
                        }
                    }
                }
                if (!list.isNullOrEmpty()) {
                    val total = list.sumOf { it.amountMinor }
                    Text(
                        "${list.size} ${if (list.size == 1) "request" else "requests"} · ${Money.wholeNaira(total)}",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                    )
                }
            }
        }
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        when {
            list == null && error == null -> item(key = "spinner") { CenteredSpinner() }
            list != null && list.isEmpty() -> item(key = "empty") {
                EmptyNote(
                    if (filter == "REQUESTED") "No withdrawals waiting to be paid." else "Nothing here yet.",
                )
            }
            list != null -> items(list, key = { it.id }) { w ->
                PayoutRow(w = w, onDone = { reloadKey++ })
            }
        }
    }
}

@Composable
private fun PayoutRow(w: AdminProducerWithdrawal, onDone: () -> Unit) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mode by remember(w.id) { mutableStateOf<String?>(null) } // "pay" | "reject"
    var value by remember(w.id) { mutableStateOf("") }
    var busy by remember(w.id) { mutableStateOf(false) }
    var error by remember(w.id) { mutableStateOf<String?>(null) }
    var copied by remember(w.id) { mutableStateOf(false) }

    LaunchedEffect(copied) {
        if (copied) {
            delay(1500)
            copied = false
        }
    }

    fun copyAccountNumber() {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            ?: return // clipboard unavailable — the number is visible anyway
        clipboard.setPrimaryClip(ClipData.newPlainText("Account number", w.accountNumber))
        copied = true
    }

    fun startAction(next: String) {
        value = ""
        error = null
        mode = next
    }

    fun submit() {
        val action = mode ?: return
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                if (action == "pay") {
                    container.adminApi.markWithdrawalPaid(w.id, MarkWithdrawalPaidRequest(value.trim()))
                } else {
                    container.adminApi.rejectWithdrawal(w.id, RejectWithdrawalRequest(value.trim()))
                }
                mode = null
                onDone()
            } catch (e: Exception) {
                error = e.friendlyOr("Action failed")
            }
            busy = false
        }
    }

    val amount = Money.wholeNaira(w.amountMinor)

    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(amount, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
            AdminPill(payoutStatusLabel(w.status), payoutStatusColor(w.status))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            if (w.producerName != null) "${w.producerName} · ${w.producerEmail}" else w.producerEmail,
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(8.dp))
        Text("${w.accountName} · ${w.bankName}", color = Color.White, fontSize = 13.sp)
        // Account number: tap to copy (thumb-sized target).
        Row(
            Modifier
                .heightIn(min = 40.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable { copyAccountNumber() }
                .padding(end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                w.accountNumber,
                color = CtColors.IndigoBright,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                if (copied) "copied" else "tap to copy",
                color = if (copied) AdminGreen else CtColors.TextSecondary,
                fontSize = 11.sp,
            )
        }
        val meta = buildString {
            append("Requested ")
            append(w.requestedAt?.let { formatIsoShort(it) } ?: "—")
            w.transferRef?.let { append(" · ref $it") }
            w.note?.let { append(" · $it") }
        }
        Text(meta, color = CtColors.TextSecondary, fontSize = 11.5.sp)

        if (w.status == "REQUESTED") {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PayoutActionChip("Mark paid", AdminGreen, Modifier.weight(1f)) { startAction("pay") }
                PayoutActionChip("Decline", CtColors.SignOutText, Modifier.weight(1f)) { startAction("reject") }
            }
        }
    }

    mode?.let { action ->
        val isPay = action == "pay"
        AlertDialog(
            onDismissRequest = { if (!busy) mode = null },
            containerColor = CtColors.BgSurface,
            title = {
                Text(if (isPay) "Mark $amount as paid?" else "Decline $amount?", color = Color.White)
            },
            text = {
                Column {
                    Text(
                        if (isPay) {
                            "Only after you've sent the transfer to ${w.accountName} " +
                                "(${w.bankName} ${w.accountNumber})."
                        } else {
                            "The amount goes back to the producer’s available balance. They’ll see your reason."
                        },
                        color = CtColors.TextSecondary,
                    )
                    Spacer(Modifier.height(12.dp))
                    GlassField(
                        label = "",
                        value = value,
                        onValueChange = { value = it.take(if (isPay) 120 else 500) },
                        placeholder = if (isPay) "Bank / Paystack transfer reference" else "Reason for the producer",
                        singleLine = isPay,
                    )
                    error?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = CtColors.SignOutText, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { submit() }, enabled = !busy && value.trim().length >= 3) {
                    if (busy) {
                        CircularProgressIndicator(
                            Modifier.width(18.dp).height(18.dp),
                            color = CtColors.IndigoLight,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(
                            if (isPay) "Mark paid" else "Decline",
                            color = (if (isPay) CtColors.IndigoLight else CtColors.SignOutText).let {
                                if (value.trim().length >= 3) it else it.copy(alpha = 0.4f)
                            },
                        )
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { mode = null }, enabled = !busy) {
                    Text("Cancel", color = CtColors.TextSecondary)
                }
            },
        )
    }
}

/** Filter chip (min 40dp tall for thumbs), styled like the Sales tab FilterPill. */
@Composable
private fun PayoutFilterChip(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .heightIn(min = 40.dp)
            .let {
                if (active) {
                    it.liquidGlass(radius = 20.dp, tint = CtColors.Brand, elevation = 0.dp)
                } else {
                    it
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color.White.copy(alpha = 0.06f))
                }
            }
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (active) Color.White else CtColors.TextSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

/** Tinted pill action, 44dp tall — web "Mark paid" / "Decline" buttons. */
@Composable
private fun PayoutActionChip(text: String, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(color.copy(alpha = 0.16f))
            .border(1.dp, color.copy(alpha = 0.30f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
