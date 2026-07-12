package com.cinnetemple.app.ui.feature.watch

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.CreatePurchaseRequest
import com.cinnetemple.app.core.network.dto.PlaybackSession
import com.cinnetemple.app.core.network.dto.ProgressRequest
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.security.SecureWindowEffect
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * watch/{id} — the crown jewel. Android port of the iOS WatchView + web watch
 * page: authorizes playback server-side (POST /v1/playback/{id}/start opens or
 * re-uses the single-view window), then presents the anti-piracy [SecurePlayer].
 *
 * Error contract from start (semantic, per the parity spec):
 *  - 403 "No active access…"        -> buy-again CTA (single view used) -> checkout route
 *  - 403 "Premiere begins <ISO>"    -> live countdown to showtime
 *  - 404 (no video / unpublished)   -> "Not available yet", NO purchase CTA
 *
 * FLAG_SECURE is held for the whole screen (blocks screenshots/recording/casting).
 */
private sealed interface WatchState {
    data object Loading : WatchState

    data class Playing(val session: PlaybackSession, val resumeSeconds: Int) : WatchState

    /** 403 — single view already used (or otherwise not entitled): purchasable. */
    data class AccessDenied(val message: String) : WatchState

    /** 403 — entitled/purchasable but the premiere hasn't started yet. */
    data class PremiereLocked(val startAtIso: String?) : WatchState

    /** 404 — title unpublished / has no video yet. Play cannot ever work; no CTA. */
    data class NotAvailable(val message: String) : WatchState

    data class Failed(val message: String) : WatchState
}

@Composable
fun WatchScreen(nav: NavController, titleId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    // Single-view policy: no screenshots, recording or non-secure mirroring.
    SecureWindowEffect(enabled = true)

    var state by remember { mutableStateOf<WatchState>(WatchState.Loading) }
    var detail by remember { mutableStateOf<TitleDetail?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var purchasing by remember { mutableStateOf(false) }
    var purchaseError by remember { mutableStateOf<String?>(null) }

    // Authorize playback. Re-runs after a re-purchase (reloadKey bump).
    LaunchedEffect(titleId, reloadKey) {
        state = WatchState.Loading
        purchaseError = null
        if (detail == null) {
            detail = runCatching { container.catalogueApi.title(titleId) }.getOrNull()
        }
        // Continue-watching resume position (best effort — 0 when absent).
        val resumeSeconds = runCatching {
            container.playbackApi.continueWatching()
                .firstOrNull { it.titleId == titleId }
                ?.positionSeconds
        }.getOrNull() ?: 0
        state = try {
            val session = container.playbackApi.start(titleId)
            WatchState.Playing(session, resumeSeconds)
        } catch (e: ApiException) {
            when {
                e.isNotFound -> WatchState.NotAvailable(e.userMessage)
                e.isForbidden -> {
                    val message = e.userMessage
                    if (message.contains("Premiere begins", ignoreCase = true)) {
                        WatchState.PremiereLocked(
                            message.substringAfter("Premiere begins").trim().ifBlank { null },
                        )
                    } else {
                        WatchState.AccessDenied(message)
                    }
                }
                else -> WatchState.Failed(e.userMessage)
            }
        } catch (_: Exception) {
            WatchState.Failed("Couldn't start playback. Check your connection and try again.")
        }
    }

    // Coming back from the checkout flow: re-check entitlement automatically.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (state is WatchState.AccessDenied && !purchasing) reloadKey++
    }

    // Buy-again: POST /v1/purchases -> pending? open the checkout route; instant? replay.
    fun buyAgain() {
        if (purchasing) return
        purchasing = true
        purchaseError = null
        scope.launch {
            try {
                val purchase = container.commerceApi.create(CreatePurchaseRequest(titleId = titleId))
                when {
                    purchase.isPending && !purchase.authorizationUrl.isNullOrBlank() ->
                        nav.navigate(
                            Routes.mockCheckout(
                                authorizationUrl = purchase.authorizationUrl,
                                reference = purchase.reference.orEmpty(),
                                titleId = titleId,
                            ),
                        )
                    // already_entitled or paid (free title) — straight back to playback.
                    else -> reloadKey++
                }
            } catch (e: ApiException) {
                purchaseError = e.userMessage
            } catch (_: Exception) {
                purchaseError = "Purchase failed. Check your connection and try again."
            }
            purchasing = false
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (val s = state) {
            WatchState.Loading -> {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.size(44.dp).align(Alignment.Center),
                )
            }

            is WatchState.Playing -> {
                val playerModifier = if (isLandscape) {
                    Modifier.fillMaxSize()
                } else {
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp)
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(16.dp))
                }
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (!isLandscape) Spacer(Modifier.weight(1f))
                    SecurePlayer(
                        session = s.session,
                        resumePositionSeconds = s.resumeSeconds,
                        posterUrl = detail?.heroUrl ?: detail?.posterUrl,
                        isLandscape = isLandscape,
                        onBack = { nav.popBackStack() },
                        refreshStreamUrl = {
                            runCatching { container.playbackApi.start(titleId).url }.getOrNull()
                        },
                        sendProgress = { position, duration ->
                            runCatching {
                                container.playbackApi.progress(
                                    titleId,
                                    ProgressRequest(
                                        positionSeconds = position.coerceAtLeast(0),
                                        durationSeconds = duration.coerceAtLeast(1),
                                    ),
                                )
                            }
                        },
                        onFinalProgress = { position, duration ->
                            // Fires from onDispose — outlives this composition.
                            container.appScope.launch {
                                runCatching {
                                    container.playbackApi.progress(
                                        titleId,
                                        ProgressRequest(
                                            positionSeconds = position.coerceAtLeast(0),
                                            durationSeconds = duration.coerceAtLeast(1),
                                        ),
                                    )
                                }
                            }
                        },
                        modifier = playerModifier,
                    )
                    if (!isLandscape) {
                        Text(
                            "Single-view ticket. Downloads, screenshots and screen recording " +
                                "aren't permitted; your account is watermarked on the stream.",
                            color = CtColors.TextSecondary,
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center,
                            lineHeight = 15.sp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 28.dp)
                                .padding(top = 14.dp),
                        )
                        Spacer(Modifier.weight(1f))
                    }
                }
            }

            is WatchState.AccessDenied -> {
                DeniedScaffold(nav = nav, title = detail?.title ?: "") {
                    Icon(
                        Icons.Filled.ConfirmationNumber,
                        contentDescription = null,
                        tint = CtColors.Brand,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        "You've used your single view",
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        "This was a pay-once, watch-once ticket. Buy again to rewatch.",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                    )
                    purchaseError?.let {
                        Spacer(Modifier.height(4.dp))
                        ErrorBanner(it)
                    }
                    Spacer(Modifier.height(10.dp))
                    val price = detail?.priceMinor
                    PrimaryButton(
                        text = when {
                            price == null -> "Buy again"
                            price <= 0L -> "Watch again — Free"
                            else -> "Buy again — ${Money.formatMinor(price, detail?.currency ?: "NGN")}"
                        },
                        onClick = ::buyAgain,
                        loading = purchasing,
                    )
                }
            }

            is WatchState.PremiereLocked -> {
                DeniedScaffold(nav = nav, title = detail?.title ?: "") {
                    Icon(
                        Icons.Filled.LiveTv,
                        contentDescription = null,
                        tint = CtColors.Brand,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        "Premiere starts in",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                    )
                    PremiereCountdownLabel(startAtIso = s.startAtIso, onElapsed = { reloadKey++ })
                    Text(
                        "Your ticket is ready — playback opens at showtime.",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    GlassButton(
                        text = "Go to the premiere room",
                        onClick = { nav.navigate(Routes.premiereRoom(titleId)) },
                        tint = CtColors.Brand,
                    )
                }
            }

            is WatchState.NotAvailable -> {
                DeniedScaffold(nav = nav, title = detail?.title ?: "") {
                    Icon(
                        Icons.Filled.VideocamOff,
                        contentDescription = null,
                        tint = CtColors.TextSecondary,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        "Not available yet",
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        "This title doesn't have a video yet. Check back soon.",
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                    )
                }
            }

            is WatchState.Failed -> {
                DeniedScaffold(nav = nav, title = detail?.title ?: "") {
                    Text(
                        "Playback error",
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        s.message,
                        color = CtColors.TextSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    GlassButton(text = "Try again", onClick = { reloadKey++ })
                }
            }
        }
    }
}

/**
 * Shared chrome for the non-playing states: glass back circle + centered title
 * up top, centered content column over the black canvas.
 */
@Composable
private fun DeniedScaffold(
    nav: NavController,
    title: String,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        androidx.compose.foundation.layout.Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(top = 16.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(40.dp)
                    .liquidGlass(radius = 20.dp)
                    .clickable { nav.popBackStack() },
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBackIos,
                    contentDescription = "Back",
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
            }
            Text(
                title,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            )
            Spacer(Modifier.width(40.dp))
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            content = content,
        )
    }
}

/** 1s-tick monospaced countdown to the premiere showtime ("2d 4h 12m" / "1h 04m 32s"). */
@Composable
private fun PremiereCountdownLabel(startAtIso: String?, onElapsed: () -> Unit) {
    val startMs = remember(startAtIso) { parseIsoMillis(startAtIso) }
    var label by remember { mutableStateOf(startAtIso?.takeIf { startMs == null } ?: "Starting soon") }
    LaunchedEffect(startMs) {
        if (startMs == null) return@LaunchedEffect
        while (isActive) {
            val left = startMs - System.currentTimeMillis()
            if (left <= 0L) {
                label = "Starting…"
                onElapsed()
                break
            }
            label = formatPremiereCountdown(left)
            delay(1_000)
        }
    }
    Text(
        label,
        color = Color.White,
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        fontFamily = FontFamily.Monospace,
        textAlign = TextAlign.Center,
    )
}

/** "2d 4h 12m" when days remain, else "1h 04m 32s" / "12m 05s". */
private fun formatPremiereCountdown(leftMs: Long): String {
    val total = leftMs / 1000L
    val d = total / 86_400
    val h = (total % 86_400) / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return when {
        d > 0 -> "${d}d ${h}h ${m}m"
        h > 0 -> "${h}h ${"%02d".format(m)}m ${"%02d".format(s)}s"
        else -> "${m}m ${"%02d".format(s)}s"
    }
}
