package com.cinnetemple.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import com.cinnetemple.app.ui.theme.CtColors

/**
 * Dark #09090B canvas with three drifting indigo aurora blobs — the Compose
 * equivalent of the iOS CinematicBackground (380-460pt circles at 32%/24%/26%
 * opacity, blurred 90pt, on a 16s ease-in-out autoreversing loop).
 *
 * Blur is emulated with radial-gradient falloff so it renders identically on
 * every API level (Modifier.blur needs API 31+).
 */
@Composable
fun CinematicBackground(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "cinematic-drift")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 16_000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "drift",
    )

    Canvas(modifier.fillMaxSize().background(CtColors.BgBase)) {
        val w = size.width
        val h = size.height
        drawBlob(
            center = Offset(w * (0.18f + 0.22f * t), h * (0.10f + 0.12f * t)),
            radius = w * 0.62f,
            color = CtColors.Brand.copy(alpha = 0.32f),
        )
        drawBlob(
            center = Offset(w * (0.92f - 0.24f * t), h * (0.42f + 0.14f * t)),
            radius = w * 0.55f,
            color = CtColors.IndigoBright.copy(alpha = 0.24f),
        )
        drawBlob(
            center = Offset(w * (0.30f + 0.18f * t), h * (0.92f - 0.14f * t)),
            radius = w * 0.60f,
            color = CtColors.IndigoDeep.copy(alpha = 0.26f),
        )
    }
}

private fun DrawScope.drawBlob(center: Offset, radius: Float, color: Color) {
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(color, color.copy(alpha = color.alpha * 0.4f), Color.Transparent),
            center = center,
            radius = radius,
        ),
        radius = radius,
        center = center,
    )
}
