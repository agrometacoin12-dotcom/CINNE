package com.cinnetemple.app.ui.feature.auth

import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.R
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.DotPagination
import com.cinnetemple.app.ui.components.IndigoGlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors

/**
 * Onboarding/welcome screen (iOS LandingView, Figma 42:13448): poster-wall
 * backdrop at 25% under a scrim, 72dp logo + wordmark, and a bottom
 * liquid-glass panel with Get Started / sign-in entry points.
 */
@Composable
fun LandingScreen(nav: NavController) {
    // Wordmark fades/slides in over 0.6s on appear (iOS behaviour).
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val wordmarkAlpha by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 600),
        label = "wordmark-alpha",
    )
    val wordmarkOffset by animateDpAsState(
        targetValue = if (appeared) 0.dp else 10.dp,
        animationSpec = tween(durationMillis = 600),
        label = "wordmark-offset",
    )

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        // Poster collage at 25% opacity.
        Image(
            painter = painterResource(R.drawable.poster_wall),
            contentDescription = null,
            modifier = Modifier.fillMaxSize().alpha(0.25f),
            contentScale = ContentScale.Crop,
        )
        // Top-to-bottom scrim: bgBase 0% -> 35% at 0.45 -> 98% at bottom.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to CtColors.BgBase.copy(alpha = 0f),
                        0.45f to CtColors.BgBase.copy(alpha = 0.35f),
                        1f to CtColors.BgBase.copy(alpha = 0.98f),
                    ),
                ),
        )
        // Flat black 45% overlay.
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)))

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(120.dp))

            // CLogo 72dp with indigo-deep 40% shadow.
            Box(
                Modifier.shadow(
                    elevation = 14.dp,
                    shape = RoundedCornerShape(18.dp),
                    clip = false,
                    ambientColor = CtColors.IndigoDeep.copy(alpha = 0.4f),
                    spotColor = CtColors.IndigoDeep.copy(alpha = 0.4f),
                ),
            ) {
                Image(
                    painter = painterResource(R.drawable.c_logo),
                    contentDescription = "CinneTemple",
                    modifier = Modifier.size(72.dp),
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Cinnetemple",
                color = Color.White,
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .alpha(wordmarkAlpha)
                    .offset(y = wordmarkOffset),
            )

            Spacer(Modifier.weight(1f))

            // Bottom liquid-glass panel.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 24.dp)
                    .liquidGlass(radius = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(36.dp))
                Text(
                    "Movies without limits",
                    color = Color.White,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "Pay once, watch once. Nigerian cinema and\nworld premieres, straight to your screen.",
                    color = Color.White.copy(alpha = 0.65f),
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                DotPagination(count = 3, selectedIndex = 0)
                Spacer(Modifier.height(20.dp))
                IndigoGlassButton(
                    text = "Get Started",
                    onClick = { nav.navigate(Routes.REGISTER) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    "I already have an account",
                    color = CtColors.IndigoLight,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clickable { nav.navigate(Routes.LOGIN) }
                        .padding(4.dp),
                )
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}
