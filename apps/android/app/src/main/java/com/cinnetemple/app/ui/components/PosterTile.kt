package com.cinnetemple.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlin.math.abs

/**
 * 2:3 poster tile (iOS PosterCard): radius 12, white-35% 1.3dp border, Coil image
 * with a deterministic per-id HSB gradient fallback (hash -> hue pair,
 * saturation .55/.6, brightness .34/.2). Title caption shows only when no image.
 *
 * Widths per spec: 120 default, 147 on Home rows, 104 in the watchlist grid.
 */
@Composable
fun PosterTile(
    id: String,
    title: String,
    posterUrl: String?,
    modifier: Modifier = Modifier,
    width: Dp = 120.dp,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(12.dp)
    var imageFailed by remember(posterUrl) { mutableStateOf(false) }
    val showFallback = posterUrl == null || imageFailed

    Box(
        modifier
            .width(width)
            .aspectRatio(2f / 3f)
            .clip(shape)
            .background(posterFallbackBrush(id))
            .border(1.3.dp, Color.White.copy(alpha = 0.35f), shape)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it },
    ) {
        if (posterUrl != null && !imageFailed) {
            AsyncImage(
                model = posterUrl,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                onError = { imageFailed = true },
            )
        }
        if (showFallback) {
            Text(
                title,
                color = Color.White.copy(alpha = 0.85f),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 10.dp),
            )
        }
    }
}

/** Deterministic HSB gradient from a title id — mirrors the iOS PosterCard fallback. */
fun posterFallbackBrush(id: String): Brush {
    val hash = abs(id.hashCode())
    val hue1 = (hash % 360).toFloat()
    val hue2 = ((hash / 360) % 360).toFloat()
    return Brush.linearGradient(
        colors = listOf(
            Color.hsv(hue1, 0.55f, 0.34f),
            Color.hsv(hue2, 0.60f, 0.20f),
        ),
    )
}
