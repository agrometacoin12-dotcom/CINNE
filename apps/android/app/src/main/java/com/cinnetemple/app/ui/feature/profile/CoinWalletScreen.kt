package com.cinnetemple.app.ui.feature.profile

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.SuccessBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

@Composable
fun CoinWalletScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val billing = container.googlePlayBilling
    val state by billing.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val activity = LocalActivity.current

    LaunchedEffect(Unit) { billing.load() }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(12.dp))
            GlassBackButton(onClick = { nav.popBackStack() })
            Spacer(Modifier.height(16.dp))
            Text("CinneTemple coins", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(20.dp))

            Column(
                Modifier.fillMaxWidth().liquidGlass(radius = 18.dp).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("${"%,d".format(state.balance)} coins", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                Text("1 CinneTemple coin = ₦1 of in-app value.", color = CtColors.TextSecondary, fontSize = 13.sp)
            }

            if (state.message != null) {
                Spacer(Modifier.height(14.dp))
                if (state.isError) ErrorBanner(state.message.orEmpty()) else SuccessBanner(state.message.orEmpty())
            }

            Spacer(Modifier.height(24.dp))
            Text("Buy coins", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))

            if (state.loading && state.products.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(36.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    state.products.forEach { product ->
                        val enabled = activity != null && !state.purchasing
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(15.dp))
                                .liquidGlass(radius = 15.dp)
                                .clickable(enabled = enabled) {
                                    billing.buy(activity!!, product.productId)
                                }
                                .padding(horizontal = 16.dp, vertical = 18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "${"%,d".format(product.coins)} coins",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            Text(product.displayPrice, color = CtColors.IndigoLight, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (state.purchasing) {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 18.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    Text("  Confirming purchase…", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(14.dp))
            GlassButton(
                text = "Retry purchases",
                onClick = { scope.launch { billing.recover() } },
                enabled = !state.purchasing,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Coins do not expire. Google Play shows the price for your Play country before you pay.",
                color = CtColors.TextSecondary,
                fontSize = 12.5.sp,
            )
            Spacer(Modifier.height(36.dp))
        }
    }
}
