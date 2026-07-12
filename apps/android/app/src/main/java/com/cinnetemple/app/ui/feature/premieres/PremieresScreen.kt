package com.cinnetemple.app.ui.feature.premieres

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.components.posterFallbackBrush
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

internal val LiveRed = Color(0xFFEF4444)

/**
 * Premieres tab — GET /v1/premieres rendered as hero cards (poster/hero art,
 * showtime + live countdown, LIVE badge, ₦ price). Tapping a card opens the
 * premiere room.
 */
@Composable
fun PremieresScreen(nav: NavController) {
    val container = LocalAppContainer.current

    var premieres by remember { mutableStateOf<List<TitleDetail>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var reloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(reloadKey) {
        loading = true
        error = null
        try {
            premieres = container.premieresApi.list()
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: Exception) {
            error = "Couldn't load premieres. Check your connection."
        }
        loading = false
    }

    // 1s ticker driving the countdowns.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(1_000)
            now = System.currentTimeMillis()
        }
    }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(Modifier.fillMaxSize()) {
            Text(
                "Premieres",
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 6.dp),
            )
            val list = premieres
            when {
                loading && list == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }

                error != null && list.isNullOrEmpty() -> ErrorState(error.orEmpty()) { reloadKey++ }

                list.isNullOrEmpty() -> EmptyState()

                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    items(list, key = { it.id }) { title ->
                        PremiereHeroCard(title = title, now = now) {
                            nav.navigate(Routes.premiereRoom(title.id))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiereHeroCard(title: TitleDetail, now: Long, onClick: () -> Unit) {
    val shape = RoundedCornerShape(17.dp)
    val startMillis = remember(title.premiereStartAt) { parseIsoMillis(title.premiereStartAt) }
    val artUrl = title.heroUrl ?: title.posterUrl

    Box(
        Modifier
            .fillMaxWidth()
            .height(190.dp)
            .clip(shape)
            .background(posterFallbackBrush(title.id))
            .clickable(onClick = onClick),
    ) {
        if (artUrl != null) {
            AsyncImage(
                model = artUrl,
                contentDescription = title.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        // Bottom scrim so the copy stays readable over the art.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, CtColors.BgBase.copy(alpha = 0.88f)),
                        startY = 90f,
                    ),
                ),
        )

        // Badges — top-left, mirrors the iOS premiere stage badge row.
        Row(
            Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (title.premiereLive) {
                PremiereBadge("● LIVE", tint = LiveRed)
            } else {
                PremiereBadge("UPCOMING", tint = null)
            }
            PremiereBadge("PREMIERE", tint = null)
        }

        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                title.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val showtime = startMillis?.let { formatShowtime(it) }
            val meta = buildString {
                if (showtime != null) append(showtime)
                if (isNotEmpty()) append(" · ")
                append(Money.priceLabel(title.priceMinor, title.currency))
            }
            Text(meta, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
            when {
                title.premiereLive -> Text(
                    "Live now — tap to enter",
                    color = CtColors.IndigoLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )

                startMillis != null -> Text(
                    "Starts in ${formatCountdown(startMillis - now)}",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}

/** Height-26 capsule badge in liquid glass — red tint for LIVE. */
@Composable
internal fun PremiereBadge(text: String, tint: Color?) {
    Box(
        Modifier.height(26.dp).liquidGlass(radius = 13.dp, tint = tint, elevation = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
            modifier = Modifier.padding(horizontal = 10.dp),
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(message, color = Color.White.copy(alpha = 0.7f), fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Box(Modifier.width(160.dp)) {
            GlassButton("Retry", onClick = onRetry)
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("No premieres scheduled", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Ticketed live premieres will appear here.",
            color = CtColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
    }
}
