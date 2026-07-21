package com.cinnetemple.app.ui.feature.title

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.CreatePurchaseRequest
import com.cinnetemple.app.core.network.dto.AddWatchlistRequest
import com.cinnetemple.app.core.network.dto.EpisodeDto
import com.cinnetemple.app.core.network.dto.PlaybackStatus
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.components.posterFallbackBrush
import com.cinnetemple.app.ui.theme.CtColors
import com.cinnetemple.app.ui.theme.CtRadius
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Title page — mirrors iOS TitleDetailView. Hero image, metadata, storyline,
 * cast, hydrated watchlist heart, premiere countdown, and the CTA driven by
 * GET /v1/playback/{id}/status:
 *  - hasAccess           -> "Watch now" -> watch/{id}
 *  - no access           -> "Get ticket ₦X" -> POST /v1/purchases -> checkout route
 *  - premiere not live   -> disabled countdown
 * NO download button (single-view policy).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TitleDetailScreen(nav: NavController, titleId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var title by remember { mutableStateOf<TitleDetail?>(null) }
    var status by remember { mutableStateOf<PlaybackStatus?>(null) }
    var inWatchlist by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var purchasing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    // Series episode picker: season chip selection (null = first season) and
    // the brief ring flashed on the Buy CTA after a locked-episode tap.
    var selectedSeasonNumber by remember { mutableStateOf<Int?>(null) }
    var ctaFlash by remember { mutableStateOf(false) }
    val ctaBring = remember { BringIntoViewRequester() }

    LaunchedEffect(titleId) {
        loading = true
        error = null
        try {
            coroutineScope {
                val titleJob = async { container.catalogueApi.title(titleId) }
                // Status/watchlist are auth extras — their failure must not blank the page.
                val statusJob = async {
                    runCatching { container.playbackApi.status(titleId) }.getOrNull()
                }
                val watchlistJob = async {
                    runCatching { container.watchlistApi.list() }.getOrNull()
                }
                title = titleJob.await()
                status = statusJob.await()
                inWatchlist = watchlistJob.await()?.any { it.titleId == titleId } == true
            }
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: IOException) {
            error = "You appear to be offline. Check your connection and try again."
        }
        loading = false
    }

    // Coming back from checkout (or the player) can change entitlement state —
    // re-check playback status on every resume (it never opens the window).
    // Series also re-fetch the title so per-episode `consumed` flags update;
    // the short delay lets the player's final >=95% heartbeat commit first.
    LifecycleResumeEffect(titleId) {
        val job = scope.launch {
            runCatching { container.playbackApi.status(titleId) }
                .onSuccess { status = it }
            if (title?.isSeries == true) {
                delay(1_200)
                runCatching { container.catalogueApi.title(titleId) }
                    .onSuccess { title = it }
            }
        }
        onPauseOrDispose { job.cancel() }
    }

    // 1s ticker for the premiere countdown.
    val premiereMillis = parseIsoMillis(title?.premiereStartAt)
    val premierePending = title?.isPremiere == true &&
        !(status?.premiereLive ?: title?.premiereLive ?: false) &&
        (premiereMillis == null || premiereMillis > now)
    LaunchedEffect(premierePending) {
        while (premierePending && isActive) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        when {
            loading && title == null -> CircularProgressIndicator(
                color = Color.White,
                modifier = Modifier.align(Alignment.Center),
            )
            title == null -> Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ErrorBanner(error ?: "Title not found")
                GlassButton("Go back", onClick = { nav.popBackStack() })
            }
            else -> {
                val detail = title!!
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                ) {
                    // --- Hero image with bottom fade to bgBase ---
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(420.dp)
                            .background(
                                Brush.linearGradient(
                                    listOf(CtColors.IndigoDeep.copy(alpha = 0.55f), CtColors.BgBase),
                                ),
                            ),
                    ) {
                        val image = detail.heroUrl ?: detail.posterUrl
                        if (image != null) {
                            AsyncImage(
                                model = image,
                                contentDescription = detail.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Box(Modifier.fillMaxSize().background(posterFallbackBrush(detail.id)))
                        }
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.verticalGradient(
                                        0f to Color.Transparent,
                                        0.55f to Color.Transparent,
                                        1f to CtColors.BgBase,
                                    ),
                                ),
                        )
                    }

                    // --- Content, pulled up over the fade ---
                    Column(
                        Modifier
                            .offset(y = (-24).dp)
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        notice?.let { SuccessBanner(it) }
                        error?.let { ErrorBanner(it) }

                        Text(
                            detail.title,
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                        )

                        // Meta: 2024 • Genre1, Genre2 • 2h 15m • PG-13
                        val meta = buildList {
                            if (detail.year > 0) add(detail.year.toString())
                            if (detail.genres.isNotEmpty()) add(detail.genres.take(2).joinToString(", "))
                            detail.runtimeMinutes?.let { add(formatRuntime(it)) }
                            detail.maturityRating?.let { add(it) }
                        }.joinToString(" • ")
                        if (meta.isNotEmpty()) {
                            Text(meta, color = Color.White.copy(alpha = 0.6f), fontSize = 12.5.sp)
                        }

                        detail.rating?.let { rating ->
                            Text(
                                "★ ${String.format(Locale.US, "%.1f", rating)}/10 IMDb",
                                color = CtColors.IndigoLight,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        // Ticket price line — ₦ from priceMinor, "Free" when 0.
                        Text(
                            if (detail.priceMinor <= 0) "Ticket • Free"
                            else "Ticket • ${Money.formatMinor(detail.priceMinor, detail.currency)} • watch once",
                            color = CtColors.TextSecondary,
                            fontSize = 12.5.sp,
                        )

                        // Premiere countdown chip.
                        if (detail.isPremiere) {
                            PremiereChip(
                                live = status?.premiereLive ?: detail.premiereLive,
                                premiereMillis = premiereMillis,
                                now = now,
                            )
                        }

                        Spacer(Modifier.height(4.dp))

                        // --- Primary CTA (no Download button: single-view policy) ---
                        // Wrapped so a locked-episode tap can scroll here and
                        // flash a ring around it (mirrors iOS ctaHighlight).
                        val flashColor by animateColorAsState(
                            targetValue = if (ctaFlash) CtColors.IndigoLight.copy(alpha = 0.9f) else Color.Transparent,
                            label = "ctaFlash",
                        )
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .bringIntoViewRequester(ctaBring)
                                .border(2.dp, flashColor, RoundedCornerShape(CtRadius.cta)),
                        ) {
                            PrimaryCta(
                                detail = detail,
                                status = status,
                                premierePending = premierePending,
                                premiereMillis = premiereMillis,
                                now = now,
                                purchasing = purchasing,
                                onWatch = { nav.navigate(Routes.watch(detail.id)) },
                                onWatchEpisode = { episodeId ->
                                    nav.navigate(Routes.watch(detail.id, episodeId))
                                },
                                onBuy = {
                                purchasing = true
                                error = null
                                notice = null
                                scope.launch {
                                    try {
                                        val res = container.commerceApi.create(
                                            CreatePurchaseRequest(titleId = detail.id),
                                        )
                                        when {
                                            res.isAlreadyEntitled || res.isPaid -> {
                                                notice = "You have a ticket — enjoy the show."
                                                runCatching { container.playbackApi.status(detail.id) }
                                                    .onSuccess { status = it }
                                            }
                                            res.isPending && !res.authorizationUrl.isNullOrBlank() -> {
                                                nav.navigate(
                                                    Routes.mockCheckout(
                                                        authorizationUrl = res.authorizationUrl!!,
                                                        reference = res.reference.orEmpty(),
                                                        titleId = detail.id,
                                                    ),
                                                )
                                            }
                                            else -> error = "Purchase could not be started. Try again."
                                        }
                                    } catch (e: ApiException) {
                                        error = e.userMessage
                                    } catch (_: IOException) {
                                        error = "You appear to be offline. Check your connection and try again."
                                    }
                                        purchasing = false
                                    }
                                },
                            )
                        }

                        // --- Series: the seasons/episodes picker (movies skip) ---
                        if (detail.isSeries && !detail.seasonsList.isNullOrEmpty()) {
                            EpisodesSection(
                                detail = detail,
                                hasAccess = status?.hasAccess == true,
                                selectedSeasonNumber = selectedSeasonNumber,
                                onSelectSeason = { selectedSeasonNumber = it },
                                onPlayEpisode = { episodeId ->
                                    nav.navigate(Routes.watch(detail.id, episodeId))
                                },
                                onLockedTap = {
                                    scope.launch {
                                        ctaFlash = true
                                        ctaBring.bringIntoView()
                                        delay(1_500)
                                        ctaFlash = false
                                    }
                                },
                            )
                        }

                        // --- Storyline ---
                        if (detail.overview.isNotBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Storyline",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                detail.overview,
                                color = Color.White.copy(alpha = 0.65f),
                                fontSize = 12.5.sp,
                                lineHeight = 18.sp,
                            )
                        }

                        // --- Director ---
                        detail.director?.takeIf { it.isNotBlank() }?.let { director ->
                            Spacer(Modifier.height(4.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Director", color = CtColors.TextSecondary, fontSize = 12.5.sp)
                                Text(
                                    director,
                                    color = Color.White,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }

                        // --- Cast: rows of 4 glass initial circles, max 8 ---
                        if (detail.cast.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Cast",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            detail.cast.take(8).chunked(4).forEach { rowMembers ->
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    rowMembers.forEach { member ->
                                        CastCell(member, Modifier.weight(1f))
                                    }
                                    repeat(4 - rowMembers.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }

                        Spacer(Modifier.height(32.dp))
                    }
                }

                // --- Floating top row: back + watchlist heart ---
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    GlassCircleButton(
                        icon = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        onClick = { nav.popBackStack() },
                    )
                    GlassCircleButton(
                        icon = if (inWatchlist) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = if (inWatchlist) "Remove from My List" else "Add to My List",
                        tint = if (inWatchlist) CtColors.Brand else Color.White,
                        onClick = {
                            val target = !inWatchlist
                            inWatchlist = target // optimistic
                            scope.launch {
                                val result = runCatching {
                                    if (target) {
                                        container.watchlistApi.add(AddWatchlistRequest(titleId))
                                    } else {
                                        container.watchlistApi.remove(titleId)
                                    }
                                }
                                if (result.isFailure) inWatchlist = !target // roll back
                            }
                        },
                    )
                }
            }
        }
    }
}

// --- CTA logic ---

@Composable
private fun PrimaryCta(
    detail: TitleDetail,
    status: PlaybackStatus?,
    premierePending: Boolean,
    premiereMillis: Long?,
    now: Long,
    purchasing: Boolean,
    onWatch: () -> Unit,
    onWatchEpisode: (String) -> Unit,
    onBuy: () -> Unit,
) {
    val hasAccess = status?.hasAccess == true
    when {
        // Entitled series: target the first unwatched playable episode
        // ("Play S1 E2" — the movie path would 404, series have no title video).
        hasAccess && !premierePending && detail.isSeries -> {
            val target = detail.firstUnwatchedPlayable()
            if (target == null) {
                GlassButton(
                    text = if (detail.hasPlayableEpisode) "All episodes watched" else "Coming soon",
                    onClick = {},
                    enabled = false,
                )
            } else {
                PrimaryButton(
                    text = "Play S${target.first.number} E${target.second.number}",
                    onClick = { onWatchEpisode(target.second.id) },
                )
            }
        }
        // Entitled movie, playable now.
        hasAccess && !premierePending -> PrimaryButton(
            text = if (status?.started == true) "Resume watching" else "Watch now",
            onClick = onWatch,
        )
        // Entitled but the premiere hasn't started — locked countdown.
        hasAccess && premierePending -> GlassButton(
            text = countdownLabel(premiereMillis, now),
            onClick = {},
            enabled = false,
        )
        // Nothing playable yet (movie without video / series without episode
        // videos) — playback would 404, so no purchase CTA either.
        if (detail.isSeries) !detail.hasPlayableEpisode else !detail.hasVideo -> GlassButton(
            text = "Coming soon",
            onClick = {},
            enabled = false,
        )
        // Not entitled — buy (allowed even before a premiere goes live).
        else -> PrimaryButton(
            text = if (detail.priceMinor <= 0) {
                "Get free ticket"
            } else {
                "Get ticket ${Money.formatMinor(detail.priceMinor, detail.currency)}"
            },
            onClick = onBuy,
            loading = purchasing,
        )
    }
}

// --- Series episode picker (mirrors iOS episodesSection) ---

@Composable
private fun EpisodesSection(
    detail: TitleDetail,
    hasAccess: Boolean,
    selectedSeasonNumber: Int?,
    onSelectSeason: (Int) -> Unit,
    onPlayEpisode: (String) -> Unit,
    onLockedTap: () -> Unit,
) {
    val seasons = detail.seasonsList.orEmpty()
    val selected = seasons.firstOrNull { it.number == selectedSeasonNumber } ?: seasons.first()

    Spacer(Modifier.height(8.dp))
    Text("Episodes", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium)
    Text(
        "One ticket unlocks every episode. Each episode plays once.",
        color = Color.White.copy(alpha = 0.5f),
        fontSize = 11.5.sp,
    )

    if (seasons.size > 1) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            seasons.forEach { season ->
                val isSelected = season.number == selected.number
                Box(
                    modifier = Modifier
                        .liquidGlass(
                            radius = 16.dp,
                            tint = if (isSelected) CtColors.Brand else null,
                            elevation = 4.dp,
                        )
                        .clickable { onSelectSeason(season.number) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        season.displayName,
                        color = if (isSelected) Color.White else Color.White.copy(alpha = 0.65f),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }

    selected.episodes.forEach { episode ->
        EpisodeRow(
            episode = episode,
            hasAccess = hasAccess,
            onPlay = { onPlayEpisode(episode.id) },
            onLockedTap = onLockedTap,
        )
    }
}

@Composable
private fun EpisodeRow(
    episode: EpisodeDto,
    hasAccess: Boolean,
    onPlay: () -> Unit,
    onLockedTap: () -> Unit,
) {
    val consumed = episode.consumed == true
    val playable = episode.hasVideo && !consumed
    val dimmed = consumed || !episode.hasVideo

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 14.dp, elevation = 4.dp)
            .clickable(enabled = playable) { if (hasAccess) onPlay() else onLockedTap() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier.size(40.dp).liquidGlass(radius = 10.dp, elevation = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "${episode.number}",
                color = Color.White.copy(alpha = if (dimmed) 0.45f else 0.9f),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                episode.name,
                color = Color.White.copy(alpha = if (dimmed) 0.5f else 1f),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            episode.runtimeMinutes?.takeIf { it > 0 }?.let {
                Text("$it min", color = Color.White.copy(alpha = 0.5f), fontSize = 11.5.sp)
            }
            episode.overview?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    color = Color.White.copy(alpha = 0.55f),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                )
            }
        }

        when {
            consumed -> EpisodeStatePill(icon = Icons.Filled.Check, text = "Watched")
            !episode.hasVideo -> EpisodeStatePill(icon = null, text = "Coming soon")
            hasAccess -> Icon(
                Icons.Filled.PlayCircle,
                contentDescription = "Play episode ${episode.number}",
                tint = CtColors.IndigoLight,
                modifier = Modifier.size(26.dp),
            )
            else -> Icon(
                Icons.Filled.Lock,
                contentDescription = "Locked",
                tint = Color.White.copy(alpha = 0.5f),
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun EpisodeStatePill(icon: ImageVector?, text: String) {
    Row(
        modifier = Modifier
            .liquidGlass(radius = 12.dp, elevation = 4.dp)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        icon?.let {
            Icon(it, contentDescription = null, tint = Color.White.copy(alpha = 0.65f), modifier = Modifier.size(11.dp))
        }
        Text(
            text,
            color = Color.White.copy(alpha = 0.65f),
            fontSize = 10.5.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

// --- Premiere chip ---

@Composable
private fun PremiereChip(live: Boolean, premiereMillis: Long?, now: Long) {
    Row(
        modifier = Modifier
            .liquidGlass(
                radius = CtRadius.badge,
                tint = if (live) Color(0xFFDC2626) else CtColors.Brand,
                elevation = 4.dp,
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            if (live) "● LIVE — PREMIERE" else "PREMIERE • ${countdownLabel(premiereMillis, now)}",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

// --- Cast cell ---

@Composable
private fun CastCell(name: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .liquidGlass(radius = CtRadius.castCircle, elevation = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                initials(name),
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            name,
            color = CtColors.TextSecondary,
            fontSize = 10.sp,
            maxLines = 2,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

private fun initials(name: String): String =
    name.split(" ")
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .take(2)
        .joinToString("")
        .ifEmpty { "?" }

// --- Glass 40dp circle icon button (back / heart) ---

@Composable
private fun GlassCircleButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    tint: Color = Color.White,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .liquidGlass(radius = CtRadius.circleButton, elevation = 6.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = tint, modifier = Modifier.size(18.dp))
    }
}

// --- Time helpers (SimpleDateFormat: java.time needs API 26+, minSdk is 24) ---

/** Parses "2026-07-11T19:30:00.000Z"-style ISO timestamps as UTC epoch millis. */
private fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank() || iso.length < 19) return null
    return runCatching {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        fmt.parse(iso.take(19))?.time
    }.getOrNull()
}

/** iOS CountdownText format: "Premieres in 2d 4h 12m" / "1h 04m 30s" / "Starting…". */
private fun countdownLabel(premiereMillis: Long?, now: Long): String {
    premiereMillis ?: return "Premiere scheduled"
    val remaining = premiereMillis - now
    if (remaining <= 0) return "Starting…"
    val totalSeconds = remaining / 1000
    val days = totalSeconds / 86_400
    val hours = (totalSeconds % 86_400) / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return if (days > 0) {
        "Premieres in ${days}d ${hours}h ${minutes}m"
    } else {
        "Premieres in ${hours}h ${minutes}m ${seconds}s"
    }
}

private fun formatRuntime(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return when {
        h > 0 && m > 0 -> "${h}h ${m}m"
        h > 0 -> "${h}h"
        else -> "${m}m"
    }
}
