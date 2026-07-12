package com.cinnetemple.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * CinneTemple is dark-only (iOS forces .preferredColorScheme(.dark)); we always
 * install the dark scheme regardless of the system setting.
 */
private val CtDarkColorScheme = darkColorScheme(
    primary = CtColors.Brand,
    onPrimary = CtColors.TextPrimary,
    primaryContainer = CtColors.IndigoDeep,
    onPrimaryContainer = CtColors.TextPrimary,
    secondary = CtColors.IndigoLight,
    onSecondary = CtColors.TextPrimary,
    tertiary = CtColors.IndigoBright,
    background = CtColors.BgBase,
    onBackground = CtColors.TextPrimary,
    surface = CtColors.BgBase,
    onSurface = CtColors.TextPrimary,
    surfaceVariant = CtColors.BgSurface,
    onSurfaceVariant = CtColors.TextSecondary,
    surfaceContainer = CtColors.BgSurface,
    surfaceContainerLow = CtColors.BgSidebar,
    surfaceContainerHigh = CtColors.BgElevated,
    surfaceContainerHighest = CtColors.BgElevated,
    outline = CtColors.Border,
    outlineVariant = CtColors.Hairline,
    error = CtColors.Danger,
    onError = CtColors.TextPrimary,
)

@Composable
fun CinneTempleTheme(content: @Composable () -> Unit) {
    // Dark-only by design; isSystemInDarkTheme() deliberately ignored.
    @Suppress("UNUSED_EXPRESSION") isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = CtDarkColorScheme,
        typography = CtTypography,
        shapes = CtShapes,
        content = content,
    )
}
