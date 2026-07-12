package com.cinnetemple.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.ui.theme.CtColors

/** Error banner — white 15sp text on brand-25% fill, brand-50% 1dp border, radius 10. */
@Composable
fun ErrorBanner(message: String, modifier: Modifier = Modifier) {
    Banner(message, CtColors.Brand.copy(alpha = 0.25f), CtColors.Brand.copy(alpha = 0.50f), modifier)
}

/** Success banner — green-22% fill, green-50% border, radius 10. */
@Composable
fun SuccessBanner(message: String, modifier: Modifier = Modifier) {
    val green = Color(0xFF22C55E)
    Banner(message, green.copy(alpha = 0.22f), green.copy(alpha = 0.50f), modifier)
}

@Composable
private fun Banner(message: String, fill: Color, borderColor: Color, modifier: Modifier) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .fillMaxWidth()
            .background(fill, shape)
            .border(1.dp, borderColor, shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(message, color = Color.White, fontSize = 15.sp)
    }
}
