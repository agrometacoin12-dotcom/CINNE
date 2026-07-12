package com.cinnetemple.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Radii ladder from the iOS spec: 10 (fields/banners), 12 (posters/CTAs), 16 (cards), 20 (panels). */
val CtShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(20.dp),
)

/** Named ad-hoc radii used across the iOS screens, for pixel parity. */
object CtRadius {
    val heroChip = 8.dp
    val categoryPill = 9.5.dp
    val field = 10.dp
    val banner = 10.dp
    val continueCard = 11.dp
    val searchPill = 11.5.dp
    val poster = 12.dp
    val cta = 12.dp
    val badge = 13.dp
    val notificationRow = 14.dp
    val signOut = 14.dp
    val card = 16.dp
    val heroCard = 17.dp
    val circleButton = 20.dp
    val panel = 20.dp
    val castCircle = 22.dp
}
