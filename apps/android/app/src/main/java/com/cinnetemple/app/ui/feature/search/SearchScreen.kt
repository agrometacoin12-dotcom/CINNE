package com.cinnetemple.app.ui.feature.search

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.TitleSummary
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.PosterTile
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import com.cinnetemple.app.ui.theme.CtRadius
import java.io.IOException
import kotlinx.coroutines.delay

private val RECENT_CHIPS = listOf("Spiderman", "Parasite", "Sci-Fi movies")

/**
 * Search — mirrors iOS SearchView (Figma 42:13705): 300ms-debounced
 * GET /v1/catalogue/search?q=, Recent chips + Trending grid when idle,
 * results grid / empty state when querying.
 */
@Composable
fun SearchScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val keyboard = LocalSoftwareKeyboardController.current

    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<TitleSummary>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var trending by remember { mutableStateOf<List<TitleSummary>>(emptyList()) }

    // Trending fill — browse once, flatten all rows (dedup by id).
    LaunchedEffect(Unit) {
        runCatching { container.catalogueApi.browse() }.onSuccess { browse ->
            trending = browse.rows.flatMap { it.items }.distinctBy { it.id }
        }
    }

    // 300ms debounce: LaunchedEffect restarts (cancelling the delay) on each keystroke.
    LaunchedEffect(query) {
        val q = query.trim()
        error = null
        if (q.isEmpty()) {
            results = emptyList()
            searching = false
            return@LaunchedEffect
        }
        delay(300)
        searching = true
        try {
            results = container.catalogueApi.search(q).results
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: IOException) {
            error = "You appear to be offline."
        } finally {
            searching = false
        }
    }

    val isQuerying = query.trim().isNotEmpty()

    Column(
        Modifier
            .fillMaxSize()
            .background(CtColors.BgBase)
            .imePadding()
            .padding(horizontal = 16.dp),
    ) {
        Spacer(Modifier.height(12.dp))

        // Glass search field — same 44dp / radius-11.5 pill as Home, live input.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .liquidGlass(radius = CtRadius.searchPill, elevation = 6.dp)
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
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text(
                        "Search for movies, shows....",
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 13.sp,
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
                    cursorBrush = SolidColor(CtColors.Brand),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                )
            }
            if (query.isNotEmpty()) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Clear search",
                    tint = Color.White.copy(alpha = 0.6f),
                    modifier = Modifier
                        .size(16.dp)
                        .clickable { query = "" },
                )
            }
        }

        Spacer(Modifier.height(18.dp))

        error?.let {
            ErrorBanner(it)
            Spacer(Modifier.height(12.dp))
        }

        if (!isQuerying) {
            IdleContent(
                trending = trending,
                onChip = { query = it },
                onTitle = { nav.navigate(Routes.title(it)) },
            )
        } else {
            ResultsContent(
                query = query.trim(),
                results = results,
                searching = searching,
                onTitle = { nav.navigate(Routes.title(it)) },
            )
        }
    }
}

// --- Idle: Recent chips + Trending grid ---

@Composable
private fun IdleContent(
    trending: List<TitleSummary>,
    onChip: (String) -> Unit,
    onTitle: (String) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 100.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Column {
                Text(
                    "Recent",
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(androidx.compose.foundation.rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    RECENT_CHIPS.forEach { chip ->
                        Box(
                            modifier = Modifier
                                .liquidGlass(radius = 20.dp, elevation = 4.dp)
                                .clickable { onChip(chip) }
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                        ) {
                            Text(chip, color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                        }
                    }
                }
                Spacer(Modifier.height(22.dp))
                Text(
                    "Trending Now",
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        items(trending, key = { it.id }) { item ->
            GridPoster(item = item, onClick = { onTitle(item.id) })
        }
    }
}

// --- Active query: Results / spinner / empty state ---

@Composable
private fun ResultsContent(
    query: String,
    results: List<TitleSummary>,
    searching: Boolean,
    onTitle: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Text(
            "Results",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(12.dp))
        when {
            searching -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(28.dp))
            }
            results.isEmpty() -> Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("🔍", fontSize = 34.sp)
                Text(
                    "No results for \"$query\".",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 13.sp,
                )
            }
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 100.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(results, key = { it.id }) { item ->
                    GridPoster(item = item, onClick = { onTitle(item.id) })
                }
            }
        }
    }
}

/** 2:3 grid tile with title + meta caption underneath. */
@Composable
private fun GridPoster(item: TitleSummary, onClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PosterTile(
            id = item.id,
            title = item.title,
            posterUrl = item.posterUrl,
            width = 200.dp, // constrained by the grid cell; keeps 2:3 via aspectRatio
            onClick = onClick,
            modifier = Modifier.fillMaxWidth(),
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
