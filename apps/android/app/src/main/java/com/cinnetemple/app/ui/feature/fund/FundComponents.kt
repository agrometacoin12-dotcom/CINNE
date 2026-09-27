package com.cinnetemple.app.ui.feature.fund

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.FundingPool
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.ui.theme.CtColors

/** Same labels as the web /fund STATUS_LABEL. */
internal fun poolStatusLabel(status: String): String = when (status) {
    "OPEN" -> "Open"
    "CLOSED" -> "Funding closed"
    "PAID_OUT" -> "Paid out"
    "CANCELLED" -> "Cancelled"
    else -> status
}

internal fun backersLabel(n: Int): String = if (n == 1) "1 backer" else "${Money.grouped(n.toLong())} backers"

internal fun Throwable.fundMessage(fallback: String): String =
    (this as? ApiException)?.userMessage ?: fallback

/** Credits / payouts — web emerald. */
internal val FundGreen = Color(0xFF6EE7B7)

/** "₦X raised" · "of ₦Y · N backers" and a progress bar when the pool has a goal. */
@Composable
internal fun PoolProgress(pool: FundingPool, modifier: Modifier = Modifier) {
    val goal = pool.goalCoins
    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                "${Money.naira(pool.totalCoins)} raised",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                (if (goal != null && goal > 0) "of ${Money.naira(goal)}" else "no cap") +
                    " · " + backersLabel(pool.backers),
                color = CtColors.TextSecondary,
                fontSize = 12.sp,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
        }
        if (goal != null && goal > 0) {
            val fraction = (pool.totalCoins.toFloat() / goal.toFloat()).coerceIn(0f, 1f)
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color.White.copy(alpha = 0.10f)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(fraction)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(4.dp))
                        .background(CtColors.IndigoLight),
                )
            }
        }
    }
}
