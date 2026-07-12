package com.cinnetemple.app.ui.feature.settings

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.SessionInfo
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.launch

/**
 * Full-screen active-sessions manager — GET /v1/sessions with per-row revoke
 * (DELETE /v1/sessions/{id}) and a "This device" flag on the session whose
 * deviceId matches this install's TokenStore deviceId.
 */
@Composable
fun SessionsScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var sessions by remember { mutableStateOf<List<SessionInfo>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var deviceId by remember { mutableStateOf<String?>(null) }
    var revokingId by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(refreshKey) {
        deviceId = container.tokenStore.deviceId()
        try {
            sessions = container.sessionsApi.list()
            error = null
        } catch (e: ApiException) {
            error = e.userMessage
        } catch (_: Exception) {
            error = "Couldn't load your sessions."
        }
    }

    fun revoke(id: String) {
        if (revokingId != null) return
        scope.launch {
            revokingId = id
            try {
                container.sessionsApi.revoke(id)
                sessions = sessions?.filterNot { it.id == id }
                error = null
            } catch (e: ApiException) {
                error = e.userMessage
            } catch (_: Exception) {
                error = "Couldn't revoke that session."
            }
            revokingId = null
        }
    }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // Top bar — glass back circle, centered title, Refresh link.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BackCircleButton { nav.popBackStack() }
                Text(
                    "Active sessions",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "Refresh",
                    color = CtColors.IndigoLight,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { refreshKey++ }.padding(4.dp),
                )
            }

            if (error != null) {
                ErrorBanner(error.orEmpty(), Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }

            val list = sessions
            when {
                list == null -> Box(
                    Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Color.White)
                }

                list.isEmpty() -> Text(
                    "No active sessions.",
                    color = CtColors.TextSecondary,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                )

                else -> Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .liquidGlass(radius = 16.dp)
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    list.forEachIndexed { index, session ->
                        if (index > 0) HorizontalDivider(color = CtColors.Hairline, thickness = 1.dp)
                        SessionRow(
                            session = session,
                            isCurrentDevice = session.deviceId != null && session.deviceId == deviceId,
                            revoking = revokingId == session.id,
                            onRevoke = { revoke(session.id) },
                        )
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

/**
 * One session row — userAgent (1 line) + ip/date caption on the left, bold
 * indigo "Revoke" on the right; indigo "This device" chip on the current device.
 * Shared by SessionsScreen and the SettingsScreen sessions card.
 */
@Composable
internal fun SessionRow(
    session: SessionInfo,
    isCurrentDevice: Boolean,
    revoking: Boolean,
    onRevoke: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    session.userAgent?.takeIf { it.isNotBlank() } ?: "Unknown device",
                    color = Color.White,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (isCurrentDevice) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .background(CtColors.Brand.copy(alpha = 0.25f), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text(
                            "This device",
                            color = CtColors.IndigoLight,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            Spacer(Modifier.height(2.dp))
            val meta = listOfNotNull(
                session.ip?.takeIf { it.isNotBlank() },
                formatSessionDate(session.createdAt),
            ).joinToString(" · ")
            if (meta.isNotEmpty()) {
                Text(meta, color = CtColors.TextSecondary, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        if (revoking) {
            CircularProgressIndicator(Modifier.size(16.dp), color = CtColors.Brand, strokeWidth = 2.dp)
        } else {
            Text(
                "Revoke",
                color = CtColors.Brand,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onRevoke).padding(4.dp),
            )
        }
    }
}

/** 40dp liquid-glass back circle (iOS glass circle icon button). */
@Composable
internal fun BackCircleButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .liquidGlass(radius = 20.dp, elevation = 4.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = "Back",
            tint = Color.White,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** "Jul 12, 2026" from the backend's ISO timestamp (UTC), minSdk-24 safe. */
internal fun formatSessionDate(iso: String): String? {
    if (iso.length < 19) return null
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val date = parser.parse(iso.take(19)) ?: return null
        SimpleDateFormat("MMM d, yyyy", Locale.US).format(date)
    } catch (_: Exception) {
        null
    }
}
