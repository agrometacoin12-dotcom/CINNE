package com.cinnetemple.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.cinnetemple.app.ui.theme.CtColors

/**
 * The core "liquid glass" surface — Compose port of the iOS LiquidGlass modifier:
 * translucent fill (ultraThinMaterial fallback: white 8%), optional 30%-opacity
 * color tint behind it, metallic gradient hairline rim (white 55% -> 5% -> 22%)
 * and a soft black drop shadow.
 *
 * @param radius corner radius (continuous/squircle on iOS; rounded here).
 * @param tint   accent behind the glass, e.g. [CtColors.Brand] for active/primary
 *               surfaces or red for LIVE badges. Applied at 30% opacity.
 */
fun Modifier.liquidGlass(
    radius: Dp = 16.dp,
    tint: Color? = null,
    elevation: Dp = 12.dp,
): Modifier {
    val shape = RoundedCornerShape(radius)
    var m = this
        .shadow(
            elevation = elevation,
            shape = shape,
            clip = false,
            ambientColor = Color.Black.copy(alpha = 0.45f),
            spotColor = Color.Black.copy(alpha = 0.45f),
        )
        .clip(shape)
    if (tint != null) m = m.background(tint.copy(alpha = 0.30f))
    return m
        .background(CtColors.GlassFill)
        .border(1.dp, CtColors.GlassRim, shape)
}

/** Content wrapped in liquidGlass(radius 16) — the standard card container. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    radius: Dp = 16.dp,
    tint: Color? = null,
    contentPadding: Dp = 24.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier.liquidGlass(radius = radius, tint = tint),
        content = { Box(Modifier.padding(contentPadding)) { content() } },
    )
}
