package com.cinnetemple.app.ui.feature.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.BrowseResponse
import com.cinnetemple.app.core.network.dto.BrowseRow
import com.cinnetemple.app.core.network.dto.ContinueWatchingItem
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.network.dto.TitleSummary
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.PosterTile
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.components.posterFallbackBrush
import com.cinnetemple.app.ui.theme.CtColors
import com.cinnetemple.app.ui.theme.CtRadius
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private const val PILL_ALL = "All Movies"

/**
 * Home — mirrors iOS HomeView (Figma 42:13488) with the Android-only upgrades
 * from the parity spec: category pills that REALLY filter the rows client-side
 * and a live Continue Watching rail from GET /v1/playback/continue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var browse by remember { mutableStateOf<BrowseResponse?>(null) }
    var continueItems by remember { mutableStateOf<List<ContinueWatchingItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedPill by rememberSaveable { mutableStateOf(PILL_ALL) }
    var pendingRemoval by remember { mutableStateOf<ContinueWatchingItem?>(null) }

    suspend fun loadAll() {
        error = null
        try {
            coroutineScope {
                val browseJob = async { container.catalogueApi.browse() }
                // Continue Watching is auth-only and non-fatal — an error just hides the rail.
                val continueJob = async {
                    runCatching { container.playbackApi.continueWatching() }.getOrDefault(emptyList())
                }
                browse = browseJob.await()
                continueItems = continueJob.await()
            }
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: IOException) {
            error = "You appear to be offline. Pull down to retry."
        }
    }

    LaunchedEffect(Unit) {
        loading = browse == null
        loadAll()
        loading = false
    }

    // Coming back from the player (or a purchase) changes resume progress —
    // silently refresh the rail on every resume.
    LifecycleResumeEffect(Unit) {
        val job = scope.launch {
            runCatching { container.playbackApi.continueWatching() }
                .onSuccess { continueItems = it }
        }
        onPauseOrDispose { job.cancel() }
    }

    // "All Movies" plus every genre present in the live catalogue (iOS parity).
    val pills = remember(browse) {
        val genres = browse?.rows.orEmpty()
            .flatMap { it.items }
            .flatMap { it.genres }
            .filter { it.isNotBlank() }
            .distinct()
            .sorted()
        listOf(PILL_ALL) + genres
    }
    // Pills filter the rows client-side; "All Movies" resets; empty rows hide.
    val filteredRows = remember(browse, selectedPill) {
        val rows = browse?.rows.orEmpty()
        if (selectedPill == PILL_ALL) {
            rows
        } else {
            rows.mapNotNull { row ->
                val kept = row.items.filter { it.matchesPill(selectedPill) }
                if (kept.isEmpty()) null else row.copy(items = kept)
            }
        }
    }

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    loadAll()
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(26.dp),
            ) {
                item(key = "topbar") {
                    HomeTopBar(
                        onSearch = { nav.navigate(Routes.SEARCH) },
                        onNotifications = { nav.navigate(Routes.NOTIFICATIONS) },
                        onProfile = { nav.navigate(Routes.PROFILE) },
                    )
                }

                error?.let { message ->
                    item(key = "error") {
                        ErrorBanner(message, Modifier.padding(horizontal = 20.dp))
                    }
                }

                item(key = "hero") {
                    val hero = browse?.hero
                    when {
                        hero != null -> HeroCard(
                            hero = hero,
                            onPlay = {
                                if (hero.hasVideo) nav.navigate(Routes.watch(hero.id))
                                else nav.navigate(Routes.title(hero.id))
                            },
                            onInfo = { nav.navigate(Routes.title(hero.id)) },
                        )
                        loading -> HeroPlaceholder()
                        // No featured title -> no hero section (mirror iOS null hero).
                    }
                }

                if (continueItems.isNotEmpty()) {
                    item(key = "continue") {
                        ContinueWatchingRail(
                            items = continueItems,
                            onResume = { nav.navigate(Routes.watch(it.titleId)) },
                            onLongPress = { pendingRemoval = it },
                        )
                    }
                }

                item(key = "categories") {
                    CategoryPillRow(
                        pills = pills,
                        selected = selectedPill,
                        onSelect = { selectedPill = it },
                    )
                }

                items(filteredRows, key = { it.slug }) { row ->
                    PosterRow(row = row, onTitle = { nav.navigate(Routes.title(it)) })
                }

                // Clearance for the floating tab bar (iOS uses 72pt too).
                item(key = "tab-spacer") { Spacer(Modifier.height(72.dp)) }
            }
        }
    }

    pendingRemoval?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            containerColor = CtColors.BgSurface,
            titleContentColor = Color.White,
            textContentColor = CtColors.TextSecondary,
            title = { Text("Remove from Continue Watching?") },
            text = { Text("“${item.title}” will disappear from this rail. Your ticket isn't affected.") },
            confirmButton = {
                TextButton(onClick = {
                    pendingRemoval = null
                    scope.launch {
                        runCatching { container.playbackApi.clearProgress(item.titleId) }
                        continueItems = continueItems.filterNot { it.titleId == item.titleId }
                    }
                }) { Text("Remove", color = CtColors.SignOutText) }
            },
            dismissButton = {
                TextButton(onClick = { pendingRemoval = null }) {
                    Text("Cancel", color = CtColors.IndigoLight)
                }
            },
        )
    }
}

private fun TitleSummary.matchesPill(pill: String): Boolean =
    pill == PILL_ALL ||
        genres.any { it.equals(pill, ignoreCase = true) } ||
        type.equals(pill, ignoreCase = true)

// --- Top bar (contract item 3): glass search pill + bell + avatar in ONE row ---

@Composable
private fun HomeTopBar(
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onProfile: () -> Unit,
) {
    Row(
        Modifier.padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Glass search pill — height 44, radius 11.5, taps through to Search.
        Row(
            modifier = Modifier
                .weight(1f)
                .height(44.dp)
                .liquidGlass(radius = CtRadius.searchPill, elevation = 6.dp)
                .clickable(onClick = onSearch)
                .padding(horizontal = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Filled.Search,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp),
            )
            Text(
                "Search for movies, shows....",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            Icons.Outlined.Notifications,
            contentDescription = "Notifications",
            tint = Color.White,
            modifier = Modifier
                .size(24.dp)
                .clickable(onClick = onNotifications),
        )
        // Avatar (36-40dp circle, person glyph) — opens Profile; small chevron.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(CtColors.Brand.copy(alpha = 0.20f))
                    .clickable(onClick = onProfile),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Person,
                    contentDescription = "Profile",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
            Icon(
                Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

// --- Hero card ---

@Composable
private fun HeroCard(hero: TitleDetail, onPlay: () -> Unit, onInfo: () -> Unit) {
    val shape = RoundedCornerShape(CtRadius.heroCard)
    Box(
        modifier = Modifier
            .padding(horizontal = 20.dp)
            .fillMaxWidth()
            .height(172.dp)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(CtColors.IndigoDeep.copy(alpha = 0.5f), CtColors.BgBase),
                ),
            )
            .clickable(onClick = onInfo),
    ) {
        val image = hero.heroUrl ?: hero.posterUrl
        if (image != null) {
            // TOP-ANCHORED fill crop (contract item 4): demo/marketing key art
            // carries a baked-in title lockup near its bottom edge — anchoring
            // the crop to the top keeps it outside the 172dp card window.
            AsyncImage(
                model = image,
                contentDescription = hero.title,
                contentScale = ContentScale.Crop,
                alignment = Alignment.TopCenter,
                modifier = Modifier.fillMaxSize(),
            )
        }
        // Bottom scrim gradient — clear at center to #09090B 80% at the bottom.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.5f to Color.Transparent,
                        1f to CtColors.BgBase.copy(alpha = 0.80f),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                hero.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // Meta line: year • first genre • runtime • ★ rating.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                if (hero.year > 0) {
                    HeroMeta(hero.year.toString())
                    HeroMetaDot()
                }
                hero.genres.firstOrNull()?.let {
                    HeroMeta(it)
                    HeroMetaDot()
                }
                hero.runtimeMinutes?.takeIf { it > 0 }?.let {
                    HeroMeta("${it / 60}h ${it % 60}m")
                    HeroMetaDot()
                }
                hero.rating?.let { rating ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = CtColors.Star,
                            modifier = Modifier.size(9.dp),
                        )
                        Text(
                            String.format(Locale.US, "%.1f", rating),
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 9.sp,
                        )
                    }
                }
            }
            if (hero.overview.isNotBlank()) {
                Text(
                    hero.overview,
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 10.sp,
                    lineHeight = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(2.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroChip(
                    text = "Play now",
                    icon = Icons.Filled.PlayArrow,
                    background = CtColors.Brand.copy(alpha = 0.20f),
                    onClick = onPlay,
                )
                HeroChip(
                    text = "More info",
                    icon = Icons.Filled.Info,
                    background = Color.Transparent,
                    onClick = onInfo,
                    bordered = true,
                )
            }
        }
    }
}

@Composable
private fun HeroMeta(text: String) {
    Text(
        text,
        color = Color.White.copy(alpha = 0.6f),
        fontSize = 9.sp,
        fontWeight = FontWeight.Medium,
    )
}

@Composable
private fun HeroMetaDot() {
    Box(
        Modifier
            .size(2.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.4f)),
    )
}

@Composable
private fun HeroChip(
    text: String,
    icon: ImageVector,
    background: Color,
    onClick: () -> Unit,
    bordered: Boolean = false,
) {
    val shape = RoundedCornerShape(CtRadius.heroChip)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(background)
            .let { if (bordered) it.border(0.5.dp, Color.White, shape) else it }
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
        Text(text, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun HeroPlaceholder() {
    Box(
        Modifier
            .padding(horizontal = 20.dp)
            .fillMaxWidth()
            .height(172.dp)
            .clip(RoundedCornerShape(CtRadius.heroCard))
            .background(Color.White.copy(alpha = 0.05f)),
    )
}

// --- Category pills (functional filter) ---

@Composable
private fun CategoryPillRow(pills: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Categories",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(pills, key = { it }) { pill ->
                val active = pill == selected
                Box(
                    modifier = Modifier
                        .height(32.dp)
                        .let {
                            if (active) {
                                it.liquidGlass(
                                    radius = CtRadius.categoryPill,
                                    tint = CtColors.Brand,
                                    elevation = 4.dp,
                                )
                            } else {
                                it.clip(RoundedCornerShape(CtRadius.categoryPill))
                            }
                        }
                        .clickable { onSelect(pill) }
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        pill,
                        fontSize = 11.sp,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                        // iOS parity: inactive pills are near-invisible #1D1F26 @ 40%.
                        color = if (active) Color.White else Color(0xFF1D1F26).copy(alpha = 0.4f),
                    )
                }
            }
        }
    }
}

// --- Continue Watching rail (real progress, long-press to remove) ---

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ContinueWatchingRail(
    items: List<ContinueWatchingItem>,
    onResume: (ContinueWatchingItem) -> Unit,
    onLongPress: (ContinueWatchingItem) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Continue Watching",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(19.dp),
        ) {
            items(items, key = { it.titleId }) { item ->
                // Contract item 5: tile 204x113 radius 11, image top-anchored,
                // play glyph top-left, progress INSIDE the image (12h/10b inset).
                Column(Modifier.width(204.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        modifier = Modifier
                            .width(204.dp)
                            .height(113.dp)
                            .clip(RoundedCornerShape(CtRadius.continueCard))
                            .background(posterFallbackBrush(item.titleId))
                            .combinedClickable(
                                onClick = { onResume(item) },
                                onLongClick = { onLongPress(item) },
                            ),
                    ) {
                        val image = item.heroUrl ?: item.posterUrl
                        if (image != null) {
                            AsyncImage(
                                model = image,
                                contentDescription = item.title,
                                contentScale = ContentScale.Crop,
                                alignment = Alignment.TopCenter,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        // Bottom scrim so the progress bar reads on bright art.
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.verticalGradient(
                                        0.5f to Color.Transparent,
                                        1f to CtColors.BgBase.copy(alpha = 0.80f),
                                    ),
                                ),
                        )
                        // Small play glyph, top-left.
                        Icon(
                            Icons.Filled.PlayArrow,
                            contentDescription = "Resume",
                            tint = Color.White,
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(12.dp)
                                .size(14.dp),
                        )
                        // Progress bar INSIDE the image near the bottom —
                        // indigo fill on a 20%-white track, inset 12h/10b.
                        Box(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .padding(horizontal = 12.dp)
                                .padding(bottom = 10.dp)
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(Color.White.copy(alpha = 0.20f)),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(item.progress.toFloat().coerceIn(0f, 1f))
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(CtColors.IndigoLight),
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            item.title,
                            color = Color.White,
                            fontSize = 14.sp,
                            lineHeight = 18.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            remainingLabel(item),
                            color = Color(0xFFEEEEEE).copy(alpha = 0.83f),
                            fontSize = 11.sp,
                            lineHeight = 14.sp,
                        )
                    }
                }
            }
        }
    }
}

/** "2h 14m left" / "3m left" — exact iOS remainingText format. */
private fun remainingLabel(item: ContinueWatchingItem): String {
    val remaining = (item.durationSeconds - item.positionSeconds).coerceAtLeast(0)
    val hours = remaining / 3600
    val minutes = (remaining % 3600) / 60
    return if (hours > 0) "${hours}h ${minutes}m left" else "${maxOf(minutes, 1)}m left"
}

// --- Dynamic browse rows ---

@Composable
private fun PosterRow(row: BrowseRow, onTitle: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            row.title,
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            items(row.items, key = { it.id }) { item ->
                // Bare 147-wide 2:3 poster — the design has no caption below.
                PosterTile(
                    id = item.id,
                    title = item.title,
                    posterUrl = item.posterUrl,
                    width = 147.dp,
                    onClick = { onTitle(item.id) },
                )
            }
        }
    }
}
