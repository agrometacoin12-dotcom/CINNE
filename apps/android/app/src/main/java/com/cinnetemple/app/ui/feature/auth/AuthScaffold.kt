package com.cinnetemple.app.ui.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinnetemple.app.R
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.ui.components.GlassCard
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.io.IOException

/**
 * Shared auth layout — Compose port of the iOS AuthScaffold:
 * PosterWall backdrop @25% + black-55% scrim over #09090B, CLogo 56dp with an
 * indigo shadow, then a GlassCard with a 24sp bold title, 13sp white-60%
 * subtitle and the screen's fields, plus an optional footer below the card.
 */
@Composable
fun AuthScaffold(
    title: String,
    subtitle: String,
    onBack: (() -> Unit)? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        Image(
            painter = painterResource(R.drawable.poster_wall),
            contentDescription = null,
            modifier = Modifier.fillMaxSize().alpha(0.25f),
            contentScale = ContentScale.Crop,
        )
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))
            if (onBack != null) {
                Box(Modifier.fillMaxWidth()) {
                    GlassBackButton(onBack, Modifier.align(Alignment.CenterStart))
                }
                Spacer(Modifier.height(16.dp))
            } else {
                Spacer(Modifier.height(28.dp))
            }

            // CLogo 56dp with the indigo-deep shadow.
            Box(
                Modifier.shadow(
                    elevation = 14.dp,
                    shape = RoundedCornerShape(14.dp),
                    clip = false,
                    ambientColor = CtColors.IndigoDeep.copy(alpha = 0.4f),
                    spotColor = CtColors.IndigoDeep.copy(alpha = 0.4f),
                ),
            ) {
                Image(
                    painter = painterResource(R.drawable.c_logo),
                    contentDescription = "CinneTemple",
                    modifier = Modifier.size(56.dp),
                )
            }
            Spacer(Modifier.height(24.dp))

            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                radius = 16.dp,
                contentPadding = 24.dp,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column {
                        Text(
                            title,
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            subtitle,
                            color = Color.White.copy(alpha = 0.60f),
                            fontSize = 13.sp,
                        )
                    }
                    content()
                }
            }

            if (footer != null) {
                Spacer(Modifier.height(20.dp))
                footer()
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

/** 40dp liquid-glass circle back button (iOS glass chevron circle). */
@Composable
fun GlassBackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(40.dp)
            .liquidGlass(radius = 20.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = "Back",
            tint = Color.White,
            modifier = Modifier.size(22.dp),
        )
    }
}

/** 'or' divider — 1dp white-15% lines flanking 12sp white-50% text. */
@Composable
fun OrDivider(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), thickness = 1.dp, color = Color.White.copy(alpha = 0.15f))
        Text(
            "or",
            color = Color.White.copy(alpha = 0.50f),
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        HorizontalDivider(Modifier.weight(1f), thickness = 1.dp, color = Color.White.copy(alpha = 0.15f))
    }
}

/** Footer link, e.g. "Don't have an account? *Sign Up*". */
@Composable
fun AuthFooterLink(prefix: String, action: String, onClick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(prefix, color = Color.White.copy(alpha = 0.60f), fontSize = 13.sp)
        Spacer(Modifier.size(4.dp))
        Text(
            action,
            color = CtColors.IndigoLight,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clickable(onClick = onClick),
        )
    }
}

// --- Validation (mirrors the backend rules) ---

private val EMAIL_REGEX = Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")

fun isValidEmail(email: String): Boolean = EMAIL_REGEX.matches(email.trim())

const val PASSWORD_HELP = "At least 8 characters with upper, lower, number, and symbol."

/** Null when the password satisfies the backend policy, else the first issue. */
fun passwordIssue(password: String): String? = when {
    password.isEmpty() -> null
    password.length < 8 -> "Use at least 8 characters."
    password.none { it.isUpperCase() } -> "Add an uppercase letter."
    password.none { it.isLowerCase() } -> "Add a lowercase letter."
    password.none { it.isDigit() } -> "Add a number."
    password.all { it.isLetterOrDigit() } -> "Add a symbol (e.g. ! @ #)."
    else -> null
}

fun isStrongPassword(password: String): Boolean =
    password.length >= 8 && passwordIssue(password) == null

/** Problem-detail message for banners, with friendly transport/rate-limit text. */
fun Throwable.authMessage(): String = when (this) {
    is ApiException ->
        if (isRateLimited) "Too many attempts. Please wait a minute and try again."
        else userMessage
    is IOException -> "Network error. Check your connection and try again."
    else -> message ?: "Something went wrong. Please try again."
}
