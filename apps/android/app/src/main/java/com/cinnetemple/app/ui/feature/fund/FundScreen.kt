package com.cinnetemple.app.ui.feature.fund

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.dto.FundingPool
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.components.posterFallbackBrush
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * "Fund a film" (web /fund parity): every funding pool with its progress.
 * Tapping one opens [FundPoolScreen] to fund it or claim a refund.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FundScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var pools by remember { mutableStateOf<List<FundingPool>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            pools = container.fundingApi.pools()
            error = null
        } catch (e: Exception) {
            error = e.fundMessage("Could not load films")
        }
    }

    LaunchedEffect(Unit) { load() }

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
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "back") { GlassBackButton(onClick = { nav.popBackStack() }) }
                item(key = "header") {
                    Column(Modifier.padding(top = 6.dp, bottom = 4.dp)) {
                        Text("Fund a film", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Back Nigerian films with coins. When a film pays out, every coin you put in earns its share.",
                            color = CtColors.TextSecondary,
                            fontSize = 14.sp,
                        )
                    }
                }
                error?.let { message -> item(key = "error") { ErrorBanner(message) } }

                val list = pools
                when {
                    list == null && error == null -> item(key = "loading") {
                        Box(
                            Modifier.fillMaxWidth().padding(vertical = 64.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = CtColors.Brand)
                        }
                    }
                    list != null && list.isEmpty() -> item(key = "empty") {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .liquidGlass(radius = 16.dp, elevation = 0.dp)
                                .padding(vertical = 40.dp, horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "No films are raising right now. Check back soon.",
                                color = CtColors.TextSecondary,
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                    list != null -> items(list, key = { it.id }) { pool ->
                        PoolListRow(pool) { nav.navigate(Routes.fundPool(pool.id)) }
                    }
                }
                item(key = "bottom") { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun PoolListRow(pool: FundingPool, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(width = 52.dp, height = 76.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(posterFallbackBrush(pool.titleId ?: pool.id)),
        )
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    pool.name,
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(poolStatusLabel(pool.status), color = CtColors.TextSecondary, fontSize = 12.sp, maxLines = 1)
            }
            Spacer(Modifier.height(12.dp))
            PoolProgress(pool)
        }
    }
}
