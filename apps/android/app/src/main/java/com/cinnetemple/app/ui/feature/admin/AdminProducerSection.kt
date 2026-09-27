package com.cinnetemple.app.ui.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.AssignProducerRequest
import com.cinnetemple.app.core.network.dto.TitleProducer
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.IndigoGlassButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.math.BigDecimal
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

/**
 * Movie editor → Producer (web components/admin/ProducerPanel.tsx parity).
 * The admin enters the producer's email; they get a private dashboard link
 * (views, earnings, naira withdrawals). Re-sending rotates the link, so it
 * also revokes a leaked one. Only shown when editing an existing title.
 */
@Composable
internal fun ProducerSection(titleId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    // `loaded` false = still loading (web `current === undefined`).
    var loaded by remember(titleId) { mutableStateOf(false) }
    var current by remember(titleId) { mutableStateOf<TitleProducer?>(null) }
    var email by remember(titleId) { mutableStateOf("") }
    var name by remember(titleId) { mutableStateOf("") }
    var share by remember(titleId) { mutableStateOf("90") }
    var editing by remember(titleId) { mutableStateOf(false) }
    var busy by remember(titleId) { mutableStateOf<String?>(null) } // "send" | "resend"
    var notice by remember(titleId) { mutableStateOf<String?>(null) }
    var error by remember(titleId) { mutableStateOf<String?>(null) }

    LaunchedEffect(titleId) {
        try {
            val producer = container.adminApi.titleProducer(titleId).producer
            current = producer
            if (producer != null) {
                email = producer.email
                name = producer.name.orEmpty()
                share = bpsToPercentText(producer.revenueShareBps)
            }
            loaded = true
        } catch (e: Exception) {
            error = e.friendlyOr("Could not load the producer")
        }
    }

    val shareBps = share.toDoubleOrNull()?.let { (it * 100).roundToInt() }
    val shareOk = shareBps != null && shareBps in 0..10_000

    fun send() {
        val bps = shareBps ?: return
        if (busy != null) return
        busy = "send"
        error = null
        notice = null
        scope.launch {
            try {
                val p = container.adminApi.assignProducer(
                    titleId,
                    AssignProducerRequest(
                        email = email.trim(),
                        name = name.trim().ifEmpty { null },
                        revenueShareBps = bps,
                    ),
                )
                current = p
                editing = false
                notice = "Dashboard link sent to ${p.email}."
            } catch (e: Exception) {
                error = e.friendlyOr("Could not send the link")
            }
            busy = null
        }
    }

    fun resend() {
        if (busy != null) return
        busy = "resend"
        error = null
        notice = null
        scope.launch {
            try {
                val p = container.adminApi.resendProducerLink(titleId)
                current = p
                notice = "New link sent to ${p.email}. The previous link no longer works."
            } catch (e: Exception) {
                error = e.friendlyOr("Could not resend the link")
            }
            busy = null
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Producer",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            if (current != null && !editing) {
                Spacer(Modifier.width(8.dp))
                AdminPill("Linked", AdminGreen)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "They get a private dashboard with views and earnings, and can withdraw to their bank.",
            color = CtColors.TextSecondary,
            fontSize = 11.5.sp,
        )
        Spacer(Modifier.height(12.dp))

        val linked = current
        when {
            !loaded && error == null -> Text("Loading…", color = CtColors.TextSecondary, fontSize = 13.sp)

            linked != null && !editing -> {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.20f), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ProducerFact("Producer") {
                        Text(
                            linked.name ?: linked.email,
                            color = Color.White,
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (linked.name != null) {
                            Text(
                                linked.email,
                                color = CtColors.TextSecondary,
                                fontSize = 12.5.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    ProducerFact("Share of net ticket revenue") {
                        Text(
                            "${bpsToPercentText(linked.revenueShareBps)}%",
                            color = Color.White,
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    ProducerFact("Link") {
                        Text("Sent ${ago(linked.linkSentAt)}", color = Color.White, fontSize = 13.sp)
                        Text(
                            linked.lastSeenAt?.let { "Opened ${ago(it)}" } ?: "Not opened yet",
                            color = CtColors.TextSecondary,
                            fontSize = 12.5.sp,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                IndigoGlassButton(
                    if (busy == "resend") "Sending…" else "Resend link",
                    onClick = { resend() },
                    enabled = busy == null,
                )
                Spacer(Modifier.height(10.dp))
                GlassButton(
                    "Change producer or share",
                    onClick = {
                        notice = null
                        error = null
                        editing = true
                    },
                    enabled = busy == null,
                )
            }

            loaded -> {
                GlassField(
                    label = "Producer email",
                    value = email,
                    onValueChange = { email = it.trim() },
                    placeholder = "producer@studio.ng",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                Spacer(Modifier.height(12.dp))
                GlassField(
                    label = "Name (optional)",
                    value = name,
                    onValueChange = { name = it.take(120) },
                    placeholder = "e.g. Kunle Afolayan",
                )
                Spacer(Modifier.height(12.dp))
                GlassField(
                    label = "Producer share of net ticket revenue (%)",
                    value = share,
                    onValueChange = { share = it.filter { c -> c.isDigit() || c == '.' }.take(6) },
                    placeholder = "90",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                if (!shareOk) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Share must be between 0 and 100%.",
                        color = CtColors.SignOutText,
                        fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.height(14.dp))
                IndigoGlassButton(
                    when {
                        busy == "send" -> "Sending…"
                        current != null -> "Save & send new link"
                        else -> "Send dashboard link"
                    },
                    onClick = { send() },
                    enabled = busy == null && email.isNotBlank() && shareOk,
                )
                if (current != null) {
                    Spacer(Modifier.height(10.dp))
                    GlassButton(
                        "Cancel",
                        onClick = {
                            error = null
                            editing = false
                        },
                        enabled = busy == null,
                    )
                }
            }
        }

        notice?.let {
            Spacer(Modifier.height(12.dp))
            SuccessBanner(it)
        }
        error?.let {
            Spacer(Modifier.height(12.dp))
            ErrorBanner(it)
        }
    }
}

@Composable
private fun ProducerFact(label: String, content: @Composable () -> Unit) {
    Column {
        Text(label, color = CtColors.TextSecondary, fontSize = 12.sp)
        Spacer(Modifier.height(2.dp))
        content()
    }
}

/** Server message for API errors (web ApiError parity), [fallback] for anything else. */
internal fun Throwable.friendlyOr(fallback: String): String =
    (this as? ApiException)?.userMessage ?: fallback

/** 9000 -> "90", 8750 -> "87.5" (web `bps / 100`). */
private fun bpsToPercentText(bps: Int): String =
    if (bps % 100 == 0) (bps / 100).toString() else BigDecimal(bps).movePointLeft(2).stripTrailingZeros().toPlainString()

private val PRODUCER_ISO_PATTERNS = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
)

private fun parseIsoUtc(iso: String): Date? {
    for (pattern in PRODUCER_ISO_PATTERNS) {
        try {
            val parser = SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            return parser.parse(iso) ?: continue
        } catch (_: ParseException) {
            // try the next pattern
        }
    }
    return null
}

/** Web ProducerPanel `ago`: "just now", "5m ago", "3h ago" (< 48h), else "27 Sep 2026". */
private fun ago(iso: String): String {
    val date = parseIsoUtc(iso) ?: return iso.take(10)
    val mins = ((System.currentTimeMillis() - date.time) / 60_000.0).roundToInt()
    if (mins < 1) return "just now"
    if (mins < 60) return "${mins}m ago"
    val hrs = (mins / 60.0).roundToInt()
    if (hrs < 48) return "${hrs}h ago"
    return SimpleDateFormat("d MMM yyyy", Locale.US).format(date)
}
