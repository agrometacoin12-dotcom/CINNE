package com.cinnetemple.app.ui.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.PurchaseRecord
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Purchase history (GET /v1/purchases) — reached from Profile's
 * "Purchase history" row (contract item 2). Newest first, NGN amounts via
 * [Money] (never "$"), status + gift markers, no subscription language.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PurchaseHistoryScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<PurchaseRecord>>(emptyList()) }

    suspend fun load() {
        try {
            items = container.commerceApi.history()
            error = null
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: Exception) {
            error = "Could not load your purchases."
        }
    }

    LaunchedEffect(Unit) {
        loading = true
        load()
        loading = false
    }

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        CinematicBackground(Modifier.matchParentSize())
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    load()
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(key = "back") { GlassBackButton(onClick = { nav.popBackStack() }) }
                item(key = "header") {
                    Text(
                        "Purchases",
                        color = Color.White,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 6.dp, bottom = 6.dp),
                    )
                }

                when {
                    loading -> item(key = "loading") {
                        Box(
                            Modifier.fillMaxWidth().padding(vertical = 64.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = CtColors.Brand)
                        }
                    }

                    error != null && items.isEmpty() -> item(key = "error") {
                        ErrorBanner(error ?: "Something went wrong.")
                    }

                    items.isEmpty() -> item(key = "empty") {
                        EmptyPurchases()
                    }

                    else -> items(items, key = { it.id }) { purchase ->
                        PurchaseRow(purchase)
                    }
                }
            }
        }
    }
}

/** White-4% list row: title + amount, then status (+ gift) and date. */
@Composable
private fun PurchaseRow(purchase: PurchaseRecord) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.04f), shape)
            .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                purchase.titleName,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                Money.formatMinor(purchase.amountMinor, purchase.currency),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                statusLabel(purchase.status),
                color = statusColor(purchase.status),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (purchase.isGift) {
                Text(
                    " · Gift",
                    color = CtColors.IndigoLight,
                    fontSize = 12.sp,
                )
            }
            Spacer(Modifier.weight(1f))
            Text(dateLabel(purchase.createdAt), color = CtColors.TextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun EmptyPurchases() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Filled.ReceiptLong,
            contentDescription = null,
            tint = CtColors.TextSecondary,
            modifier = Modifier.size(44.dp),
        )
        Text("No purchases yet", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text("Tickets you buy appear here.", color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}

private fun statusLabel(status: String): String = when (status) {
    "PAID" -> "Paid"
    "PENDING" -> "Pending"
    "FAILED" -> "Failed"
    "REFUNDED" -> "Refunded"
    else -> status.lowercase(Locale.US).replaceFirstChar { it.uppercase(Locale.US) }
}

private fun statusColor(status: String): Color = when (status) {
    "PAID" -> Color(0xFF22C55E)
    "FAILED" -> CtColors.SignOutText
    "REFUNDED" -> CtColors.Star
    else -> CtColors.TextSecondary
}

/** "Jul 12, 8:00 PM" from the ISO createdAt; empty when unparseable. */
private fun dateLabel(iso: String): String {
    if (iso.isBlank()) return ""
    val trimmed = iso.trim()
    val clamped = Regex("""\.(\d+)""").replace(trimmed) { m ->
        "." + m.groupValues[1].padEnd(3, '0').take(3)
    }
    val normalized = clamped
        .replace(Regex("""[zZ]$"""), "+0000")
        .replace(Regex("""([+-]\d{2}):(\d{2})$"""), "$1$2")
    val pattern = when {
        normalized.contains('.') -> "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        Regex("""[+-]\d{4}$""").containsMatchIn(normalized) -> "yyyy-MM-dd'T'HH:mm:ssZ"
        else -> "yyyy-MM-dd'T'HH:mm:ss"
    }
    val millis = try {
        SimpleDateFormat(pattern, Locale.US).parse(normalized)?.time
    } catch (_: Exception) {
        null
    } ?: return ""
    return SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(millis))
}
