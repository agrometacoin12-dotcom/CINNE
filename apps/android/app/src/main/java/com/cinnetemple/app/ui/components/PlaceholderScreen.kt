package com.cinnetemple.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.ui.theme.CtColors

/**
 * Temporary stand-in used by every routed screen until its feature team
 * replaces the file contents. Keep the screen composable's SIGNATURE stable —
 * only replace the body.
 */
@Composable
fun PlaceholderScreen(name: String) {
    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(name, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text("Screen under construction", color = CtColors.TextSecondary, fontSize = 13.sp)
        }
    }
}
