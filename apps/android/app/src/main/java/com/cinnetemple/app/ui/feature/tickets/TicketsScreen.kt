package com.cinnetemple.app.ui.feature.tickets

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.Entitlement
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.PosterTile
import com.cinnetemple.app.ui.theme.CtColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * My Tickets — pay-per-view entitlements (GET /v1/entitlements, titles joined
 * server-side) split into three sections:
 *
 *  - Ready to watch: ACTIVE — "Unused · watch anytime" before first play, or
 *    "Watching · window open" with a live countdown to expiresAt. Tap → watch.
 *  - Upcoming premieres: ACTIVE for a premiere that hasn't gone live yet
 *    (cross-referenced with GET /v1/premieres) — countdown to showtime.
 *  - Used & expired: CONSUMED shown as "Used — single view", EXPIRED as
 *    "Window ended", REVOKED as "Revoked". Tap → title page (buy again).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var entitlements by remember { mutableStateOf<List<Entitlement>>(emptyList()) }
    var premieres by remember { mutableStateOf<Map<String, TitleDetail>>(emptyMap()) }
    var reloadKey by remember { mutableLongStateOf(0L) }

    suspend fun load() {
        try {
            coroutineScope {
                val ents = async { container.commerceApi.entitlements() }
                // Premieres are decoration only — a failure must not break the list.
                val prems = async {
                    runCatching { container.premieresApi.list() }.getOrDefault(emptyList())
                }
                entitlements = ents.await()
                premieres = prems.await().associateBy { it.id }
            }
            error = null
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: Exception) {
            error = "Couldn't load your tickets. Check your connection and try again."
        }
    }

    LaunchedEffect(reloadKey) {
        loading = true
        load()
        loading = false
    }

    // 1s heartbeat so window/premiere countdowns tick.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            now = System.currentTimeMillis()
        }
    }

    val rows = entitlements.map { ticketRowFor(it, premieres, now) }
    val usable = rows.filter { it.section == TicketSection.USABLE }
    val upcoming = rows.filter { it.section == TicketSection.UPCOMING }
    val history = rows.filter { it.section == TicketSection.HISTORY }

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
                // 100dp bottom clearance for the floating tab bar.
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 100.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(key = "header") {
                    Text(
                        "My Tickets",
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 6.dp),
                    )
                }

                when {
                    loading -> item(key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(vertical = 64.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = CtColors.Brand)
                        }
                    }

                    error != null -> item(key = "error") {
                        Column {
                            ErrorBanner(error ?: "Something went wrong.")
                            Spacer(Modifier.height(14.dp))
                            GlassButton("Try again", onClick = { reloadKey++ })
                        }
                    }

                    rows.isEmpty() -> item(key = "empty") {
                        EmptyTickets()
                    }

                    else -> {
                        if (usable.isNotEmpty()) {
                            item(key = "sec-usable") { SectionHeader("Ready to watch") }
                            items(usable) { row ->
                                TicketRow(row, now) { nav.navigate(Routes.watch(row.titleId)) }
                            }
                        }
                        if (upcoming.isNotEmpty()) {
                            item(key = "sec-upcoming") { SectionHeader("Upcoming premieres") }
                            items(upcoming) { row ->
                                TicketRow(row, now) { nav.navigate(Routes.title(row.titleId)) }
                            }
                        }
                        if (history.isNotEmpty()) {
                            item(key = "sec-history") { SectionHeader("Used & expired") }
                            items(history) { row ->
                                TicketRow(row, now) { nav.navigate(Routes.title(row.titleId)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

private enum class TicketSection { USABLE, UPCOMING, HISTORY }

private data class TicketRowData(
    val titleId: String,
    val name: String,
    val posterUrl: String?,
    val section: TicketSection,
    val caption: String,
    val pill: String,
    val pillColor: Color,
    /** Epoch millis the live countdown runs to (window end / premiere start). */
    val countdownTarget: Long?,
    val countdownPrefix: String,
)

private val Green = Color(0xFF22C55E)

/** Maps one entitlement (+ optional premiere schedule) to its section/labels. */
private fun ticketRowFor(
    e: Entitlement,
    premieres: Map<String, TitleDetail>,
    now: Long,
): TicketRowData {
    val name = e.title?.title ?: "Untitled"
    val poster = e.title?.posterUrl
    val premiereStartMs = ticketParseIsoMillis(premieres[e.titleId]?.premiereStartAt)
    val expiresMs = ticketParseIsoMillis(e.expiresAt)

    fun row(
        section: TicketSection,
        caption: String,
        pill: String,
        pillColor: Color,
        countdownTarget: Long? = null,
        countdownPrefix: String = "",
    ) = TicketRowData(e.titleId, name, poster, section, caption, pill, pillColor, countdownTarget, countdownPrefix)

    return when (e.status) {
        "ACTIVE" -> when {
            // Bought before showtime — playback start would 403 until live.
            premiereStartMs != null && premiereStartMs > now && e.startedAt == null ->
                row(
                    TicketSection.UPCOMING,
                    "Premieres ${ticketFormatShowtime(premiereStartMs)}",
                    "PREMIERE",
                    CtColors.IndigoLight,
                    countdownTarget = premiereStartMs,
                    countdownPrefix = "Starts in ",
                )
            e.startedAt == null ->
                row(TicketSection.USABLE, "Unused · watch anytime", "UNUSED", CtColors.Brand)
            expiresMs == null || expiresMs > now ->
                row(
                    TicketSection.USABLE,
                    "Watching · window open",
                    "WATCHING",
                    Green,
                    countdownTarget = expiresMs,
                    countdownPrefix = "Ends in ",
                )
            // Window elapsed but the server hasn't reconciled this row yet.
            else -> row(TicketSection.HISTORY, "Window ended", "EXPIRED", CtColors.TextSecondary)
        }
        "CONSUMED" -> row(TicketSection.HISTORY, "Used — single view", "USED", CtColors.TextSecondary)
        "EXPIRED" -> row(TicketSection.HISTORY, "Window ended", "EXPIRED", CtColors.TextSecondary)
        "REVOKED" -> row(TicketSection.HISTORY, "Revoked", "REVOKED", CtColors.SignOutText)
        else -> row(TicketSection.HISTORY, e.status, e.status.uppercase(Locale.US), CtColors.TextSecondary)
    }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        color = Color.White,
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
    )
}

/** White-4% list row: poster, title + status caption (+ live countdown), pill. */
@Composable
private fun TicketRow(row: TicketRowData, now: Long, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.04f), shape)
            .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PosterTile(
            id = row.titleId,
            title = row.name,
            posterUrl = row.posterUrl,
            width = 52.dp,
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                row.name,
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Text(row.caption, color = CtColors.TextSecondary, fontSize = 12.sp)
            val target = row.countdownTarget
            if (target != null && target > now) {
                Spacer(Modifier.height(3.dp))
                Text(
                    row.countdownPrefix + ticketFormatRemaining(target - now),
                    color = CtColors.IndigoLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        StatusPill(row.pill, row.pillColor)
    }
}

/** Capsule status chip — tinted 18% fill, 45% border, 10sp bold label. */
@Composable
private fun StatusPill(text: String, color: Color) {
    Box(
        Modifier
            .background(color.copy(alpha = 0.18f), CircleShape)
            .border(1.dp, color.copy(alpha = 0.45f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** ContentUnavailableView parity: ticket icon / "No tickets yet" / hint. */
@Composable
private fun EmptyTickets() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Filled.ConfirmationNumber,
            contentDescription = null,
            tint = CtColors.TextSecondary,
            modifier = Modifier.size(44.dp),
        )
        Text("No tickets yet", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text("Buy a pay-per-view to watch.", color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}

// ---------------------------------------------------------------------------
// Time helpers (minSdk 24, no java.time / no desugaring — SimpleDateFormat)
// ---------------------------------------------------------------------------

/** Parses an ISO-8601 timestamp to epoch millis; null when absent/invalid. */
private fun ticketParseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val trimmed = iso.trim()
    // Clamp fractional seconds to 3 digits (SSS mis-parses longer fractions).
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
    return try {
        SimpleDateFormat(pattern, Locale.US).parse(normalized)?.time
    } catch (_: Exception) {
        null
    }
}

/** "Jul 12, 8:00 PM" — abbreviated-date/short-time premiere caption. */
private fun ticketFormatShowtime(millis: Long): String =
    SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(millis))

/** "2d 4h 12m" past a day, else "1h 04m 09s" — the iOS countdown format. */
private fun ticketFormatRemaining(remainingMillis: Long): String {
    if (remainingMillis <= 0) return "0h 00m 00s"
    val totalSeconds = remainingMillis / 1000
    val days = totalSeconds / 86_400
    val hours = (totalSeconds % 86_400) / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return if (days > 0) {
        "${days}d ${hours}h ${minutes}m"
    } else {
        "${hours}h " + "%02dm %02ds".format(Locale.US, minutes, seconds)
    }
}
