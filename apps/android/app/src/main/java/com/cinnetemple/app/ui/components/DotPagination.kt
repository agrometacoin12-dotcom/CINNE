package com.cinnetemple.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.cinnetemple.app.ui.theme.CtColors

/**
 * Landing-style dot pagination: active page = 18x6 indigo-light capsule,
 * inactive = 6dp white-25% circles, 6dp apart.
 */
@Composable
fun DotPagination(count: Int, selectedIndex: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(count) { index ->
            if (index == selectedIndex) {
                Box(
                    Modifier
                        .width(18.dp)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(CtColors.IndigoLight),
                )
            } else {
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.25f)),
                )
            }
        }
    }
}
