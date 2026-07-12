package com.cinnetemple.app.ui.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * CinneTemple palette — mirrors apps/ios/CinneTemple/Theme/Theme.swift
 * ("Netflix-style + Liquid Glass", which itself mirrors the web Tailwind preset).
 * The app is DARK-ONLY.
 */
object CtColors {
    /** Canvas everywhere. */
    val BgBase = Color(0xFF09090B)

    /** Progress track + launch-screen background. */
    val Track = Color(0xFF090B12)
    val BgSidebar = Color(0xFF0A0D14)
    val BgSurface = Color(0xFF10131C)

    /** Image placeholders. */
    val BgElevated = Color(0xFF141824)
    val Border = Color(0xFF121724)

    /** Primary indigo — tab tint, toggles. */
    val Brand = Color(0xFF6366F1)

    /** Links, "See all", active underlines, progress fill. */
    val IndigoLight = Color(0xFF6C6FFC)
    val IndigoBright = Color(0xFF8082FF)

    /** Gradient end, logo shadows. */
    val IndigoDeep = Color(0xFF4F46E5)
    val Accent = IndigoLight

    /** Ratings. */
    val Star = Color(0xFFFBBF24)

    /** Danger token; sign-out uses [SignOutText]/[SignOutBase] instead. */
    val Danger = Color(0xFFC0392B)
    val SignOutText = Color(0xFFF2555A)
    val SignOutBase = Color(0xFFBF1515)

    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFF9CA3AF)

    /** 1px separators inside grouped glass lists (white 8%). */
    val Hairline = Color.White.copy(alpha = 0.08f)

    /** Signature gradient: #6C6FFC -> #4F46E5, topLeading -> bottomTrailing. */
    val IndigoGradient = Brush.linearGradient(
        colors = listOf(IndigoLight, IndigoDeep),
        start = Offset.Zero,
        end = Offset.Infinite,
    )

    /** Glass surface fallback fill (no real backdrop blur pre-API 31). */
    val GlassFill = Color.White.copy(alpha = 0.08f)
    val GlassFieldFill = Color.White.copy(alpha = 0.03f)
    val GlassBorder = Color.White.copy(alpha = 0.25f)

    /** Metallic hairline rim for liquid-glass surfaces (white 55% -> 5% -> 22%). */
    val GlassRim = Brush.linearGradient(
        colors = listOf(
            Color.White.copy(alpha = 0.55f),
            Color.White.copy(alpha = 0.05f),
            Color.White.copy(alpha = 0.22f),
        ),
        start = Offset.Zero,
        end = Offset.Infinite,
    )
}
