package com.cinnetemple.app.ui.feature.watchlist

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.WatchlistItem
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.PosterTile
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * My List — GET /v1/watchlist rendered as an adaptive grid (min 104dp columns,
 * 12dp spacing, 16dp padding; iOS WatchlistView parity). Rows whose joined
 * `title` is null (deleted catalogue entry) are hidden per the API contract.
 *
 * Removal (DELETE /v1/watchlist/{titleId}, optimistic with rollback) via the
 * "Remove" caption under each poster or a long-press on the poster itself.
 * Poster tap → title/{id}. Pull-to-refresh reloads.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun WatchlistScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<WatchlistItem>>(emptyList()) }
    var reloadKey by remember { mutableIntStateOf(0) }

    suspend fun load() {
        try {
            // Hide rows whose catalogue title was deleted (title == null).
            items = container.watchlistApi.list().filter { it.title != null }
            error = null
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: Exception) {
            error = "Couldn't load your list. Check your connection and try again."
        }
    }

    LaunchedEffect(reloadKey) {
        loading = true
        load()
        loading = false
    }

    /** Optimistic removal — restores the row and shows a banner on failure. */
    fun remove(titleId: String) {
        val previous = items
        items = items.filterNot { it.titleId == titleId }
        scope.launch {
            try {
                container.watchlistApi.remove(titleId)
            } catch (e: ApiException) {
                items = previous
                error = e.userMessage
            } catch (_: Exception) {
                items = previous
                error = "Couldn't remove that title. Check your connection and try again."
            }
        }
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
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 104.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        "My List",
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                    )
                }

                when {
                    loading -> item(key = "loading", span = { GridItemSpan(maxLineSpan) }) {
                        Box(Modifier.fillMaxWidth().padding(vertical = 64.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = CtColors.Brand)
                        }
                    }

                    error != null -> item(key = "error", span = { GridItemSpan(maxLineSpan) }) {
                        Column {
                            ErrorBanner(error ?: "Something went wrong.")
                            Spacer(Modifier.height(14.dp))
                            GlassButton("Try again", onClick = { reloadKey++ })
                        }
                    }

                    items.isEmpty() -> item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                        EmptyWatchlist()
                    }

                    else -> items(items, key = { it.titleId }) { item ->
                        WatchlistCell(
                            item = item,
                            onOpen = { nav.navigate(Routes.title(item.titleId)) },
                            onRemove = { remove(item.titleId) },
                        )
                    }
                }
            }
        }
    }
}

/** PosterCard (grid width, ~104dp min) + "Remove" caption2 button beneath. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun WatchlistCell(
    item: WatchlistItem,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
) {
    val title = item.title ?: return
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        PosterTile(
            id = title.id,
            title = title.title,
            posterUrl = title.posterUrl,
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(onClick = onOpen, onLongClick = onRemove),
        )
        Text(
            "Remove",
            color = CtColors.TextSecondary,
            fontSize = 11.sp,
            modifier = Modifier
                .padding(top = 6.dp)
                .clickable(onClick = onRemove)
                .padding(horizontal = 10.dp, vertical = 2.dp),
        )
    }
}

/** Bookmark 44dp gray / "Your list is empty" / add-from-detail hint. */
@Composable
private fun EmptyWatchlist() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 72.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Outlined.BookmarkBorder,
            contentDescription = null,
            tint = CtColors.TextSecondary,
            modifier = Modifier.size(44.dp),
        )
        Text("Your list is empty", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text("Add titles from any detail screen.", color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}
