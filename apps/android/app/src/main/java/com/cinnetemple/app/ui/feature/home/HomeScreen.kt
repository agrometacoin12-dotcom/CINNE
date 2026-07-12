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
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import java.util.Calendar
import java.util.Locale
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private const val PILL_ALL = "All"
private const val PILL_MOVIES = "Movies"
private const val PILL_SERIES = "Series"

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

    val pills = remember(browse) {
        val items = browse?.rows?.flatMap { it.items }.orEmpty()
        val genres = items.asSequence()
            .flatMap { it.genres.asSequence() }
            .filter { it.isNotBlank() }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .map { it.key }
            .take(5)
        listOf(PILL_ALL, PILL_MOVIES, PILL_SERIES) + genres
    }
    // Client-side filtering — the Android improvement over iOS's visual-only pills.
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
                        greetingName = container.sessionStore.currentUser
                            ?.profile?.displayName
                            ?.split(" ")?.firstOrNull()
                            .orEmpty(),
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

                if (!loading && browse != null && filteredRows.isEmpty()) {
                    item(key = "empty-filter") {
                        Text(
                            "Nothing in “$selectedPill” yet.",
                            color = CtColors.TextSecondary,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }
                }

                item(key = "tab-spacer") { Spacer(Modifier.height(46.dp)) }
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

private fun TitleSummary.matchesPill(pill: String): Boolean = when (pill) {
    PILL_ALL -> true
    PILL_MOVIES -> type.equals("movie", ignoreCase = true)
    PILL_SERIES -> type.equals("series", ignoreCase = true)
    else -> genres.any { it.equals(pill, ignoreCase = true) }
}

// --- Top bar: greeting + bell + avatar, then the glass search pill ---

@Composable
private fun HomeTopBar(
    greetingName: String,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    onProfile: () -> Unit,
) {
    Column(
        Modifier.padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(timeGreeting(), color = CtColors.TextSecondary, fontSize = 13.sp)
                Text(
                    if (greetingName.isBlank()) "Welcome back" else greetingName,
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onNotifications) {
                Icon(
                    Icons.Filled.Notifications,
                    contentDescription = "Notifications",
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(4.dp))
            Box(
                modifier = Modifier
                    .size(44.dp)
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
        }
        // Glass search pill — height 44, radius 11.5, taps through to Search.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .liquidGlass(radius = CtRadius.searchPill, elevation = 6.dp)
                .clickable(onClick = onSearch)
                .padding(horizontal = 14.dp),
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
            )
        }
    }
}

private fun timeGreeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 5..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
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
            AsyncImage(
                model = image,
                contentDescription = hero.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        // Bottom scrim to #09090B 80%.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.45f to Color.Transparent,
                        1f to CtColors.BgBase.copy(alpha = 0.80f),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                hero.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                val meta = buildList {
                    if (hero.year > 0) add(hero.year.toString())
                    hero.genres.firstOrNull()?.let { add(it) }
                    hero.runtimeMinutes?.let { add(formatRuntime(it)) }
                }.joinToString(" · ")
                Text(meta, color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp)
                hero.rating?.let { rating ->
                    Icon(
                        Icons.Filled.Star,
                        contentDescription = null,
                        tint = CtColors.Star,
                        modifier = Modifier.size(9.dp),
                    )
                    Text(
                        String.format(Locale.US, "%.1f", rating),
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 9.sp,
                    )
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
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
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
                        color = if (active) Color.White else CtColors.TextSecondary,
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
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(items, key = { it.titleId }) { item ->
                Column(Modifier.width(204.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
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
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.25f)),
                        )
                        // Centered play affordance.
                        Box(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.45f))
                                .border(1.dp, Color.White.copy(alpha = 0.35f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = "Resume",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        // Real progress bar — indigo fill over the #090B12 track.
                        Box(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .height(4.dp)
                                .background(CtColors.Track),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(item.progress.toFloat().coerceIn(0f, 1f))
                                    .height(4.dp)
                                    .background(CtColors.IndigoLight),
                            )
                        }
                    }
                    Text(
                        item.title,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        remainingLabel(item),
                        color = Color(0xFFEEEEEE).copy(alpha = 0.83f),
                        fontSize = 11.sp,
                    )
                }
            }
        }
    }
}

private fun remainingLabel(item: ContinueWatchingItem): String {
    val remaining = (item.durationSeconds - item.positionSeconds).coerceAtLeast(0)
    val hours = remaining / 3600
    val minutes = (remaining % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m left"
        minutes > 0 -> "${minutes}m left"
        else -> "Almost done"
    }
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
                Column(Modifier.width(147.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PosterTile(
                        id = item.id,
                        title = item.title,
                        posterUrl = item.posterUrl,
                        width = 147.dp,
                        onClick = { onTitle(item.id) },
                    )
                    Text(
                        item.title,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val meta = buildList {
                        if (item.year > 0) add(item.year.toString())
                        item.genres.firstOrNull()?.let { add(it) }
                    }.joinToString(" · ")
                    if (meta.isNotEmpty()) {
                        Text(meta, color = CtColors.TextSecondary, fontSize = 11.sp, maxLines = 1)
                    }
                }
            }
        }
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
