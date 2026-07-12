package com.cinnetemple.app.ui.feature.settings

import android.content.Intent
import androidx.biometric.BiometricManager
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.cinnetemple.app.BuildConfig
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.SessionInfo
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

private const val SUPPORT_EMAIL = "support@cinnetemple.com"
private const val SESSIONS_PREVIEW_COUNT = 3

/**
 * Settings tab — iOS SettingsView parity: account card (email/status/MFA/roles),
 * biometric-lock toggle (SessionStore pref, disabled without biometrics),
 * active-sessions card with per-row revoke + "This device" flag, sign out,
 * app version and a support mailto link.
 */
@Composable
fun SettingsScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val user = container.sessionStore.currentUser

    // Biometric lock preference + hardware availability.
    val biometricEnabled by container.tokenStore.biometricLockEnabled
        .collectAsStateWithLifecycle(initialValue = false)
    val biometricAvailable = remember {
        BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL,
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }

    // Active sessions.
    var sessions by remember { mutableStateOf<List<SessionInfo>?>(null) }
    var sessionsError by remember { mutableStateOf<String?>(null) }
    var deviceId by remember { mutableStateOf<String?>(null) }
    var revokingId by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableIntStateOf(0) }
    var signingOut by remember { mutableStateOf(false) }

    LaunchedEffect(refreshKey) {
        deviceId = container.tokenStore.deviceId()
        try {
            sessions = container.sessionsApi.list()
            sessionsError = null
        } catch (e: ApiException) {
            sessionsError = e.userMessage
        } catch (_: Exception) {
            sessionsError = "Couldn't load your sessions."
        }
    }

    fun revoke(id: String) {
        if (revokingId != null) return
        scope.launch {
            revokingId = id
            try {
                container.sessionsApi.revoke(id)
                sessions = sessions?.filterNot { it.id == id }
                sessionsError = null
            } catch (e: ApiException) {
                sessionsError = e.userMessage
            } catch (_: Exception) {
                sessionsError = "Couldn't revoke that session."
            }
            revokingId = null
        }
    }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Spacer(Modifier.height(6.dp))
            Text(
                "Settings",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            // Account card.
            SettingsCard(title = "Account") {
                LabelValueRow("Email", user?.email ?: "—")
                LabelValueRow("Status", user?.status ?: "—")
                LabelValueRow("Two-factor (MFA)", if (user?.mfaEnabled == true) "Enabled" else "Off")
                LabelValueRow(
                    "Roles",
                    user?.roles?.takeIf { it.isNotEmpty() }?.joinToString(", ") ?: "user",
                )
            }

            // Security card — biometric lock toggle.
            SettingsCard(title = "Security") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Unlock with biometrics", color = Color.White, fontSize = 15.sp)
                        Spacer(Modifier.height(2.dp))
                        Text(
                            if (biometricAvailable) {
                                "Require fingerprint or face unlock when opening CinneTemple."
                            } else {
                                "No biometrics are set up on this device."
                            },
                            color = CtColors.TextSecondary,
                            fontSize = 11.sp,
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(
                        checked = biometricEnabled,
                        onCheckedChange = { enabled ->
                            scope.launch { container.sessionStore.setBiometricLockEnabled(enabled) }
                        },
                        enabled = biometricAvailable,
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = CtColors.Brand,
                            checkedThumbColor = Color.White,
                        ),
                    )
                }
            }

            // Active sessions card.
            SettingsCard(
                title = "Active sessions",
                trailing = {
                    Text(
                        "Refresh",
                        color = CtColors.TextSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.clickable { refreshKey++ }.padding(4.dp),
                    )
                },
            ) {
                when {
                    sessionsError != null -> Text(
                        sessionsError.orEmpty(),
                        color = CtColors.TextSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )

                    sessions == null -> Box(
                        Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            Modifier.width(20.dp).height(20.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                    }

                    sessions.orEmpty().isEmpty() -> Text(
                        "No active sessions.",
                        color = CtColors.TextSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )

                    else -> {
                        val list = sessions.orEmpty()
                        list.take(SESSIONS_PREVIEW_COUNT).forEachIndexed { index, session ->
                            if (index > 0) HorizontalDivider(color = CtColors.Hairline, thickness = 1.dp)
                            SessionRow(
                                session = session,
                                isCurrentDevice = session.deviceId != null && session.deviceId == deviceId,
                                revoking = revokingId == session.id,
                                onRevoke = { revoke(session.id) },
                            )
                        }
                        if (list.size > SESSIONS_PREVIEW_COUNT) {
                            HorizontalDivider(color = CtColors.Hairline, thickness = 1.dp)
                            Text(
                                "View all ${list.size} sessions",
                                color = CtColors.IndigoLight,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { nav.navigate(Routes.SESSIONS) }
                                    .padding(vertical = 10.dp),
                            )
                        }
                    }
                }
            }

            // About card — version + support mailto.
            SettingsCard(title = "About") {
                LabelValueRow("App version", BuildConfig.VERSION_NAME)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Help & Support",
                    color = CtColors.IndigoLight,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clickable {
                            try {
                                context.startActivity(
                                    Intent(Intent.ACTION_SENDTO, "mailto:$SUPPORT_EMAIL".toUri()),
                                )
                            } catch (_: Exception) {
                                // no mail app — nothing to do
                            }
                        }
                        .padding(vertical = 6.dp),
                )
            }

            // Sign out card.
            Box(Modifier.fillMaxWidth().liquidGlass(radius = 16.dp).padding(18.dp)) {
                GlassButton(
                    text = if (signingOut) "Signing out…" else "Sign out",
                    enabled = !signingOut,
                    onClick = {
                        signingOut = true
                        scope.launch { container.sessionStore.logout() }
                    },
                )
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

/** GlassCard shell (radius 16, 18dp inner padding) with a headline + optional trailing action. */
@Composable
private fun SettingsCard(
    title: String,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 16.dp)
            .padding(18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                title,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            trailing?.invoke()
        }
        Spacer(Modifier.height(10.dp))
        content()
    }
}

/** Label gray left, value white right — the iOS account-card row. */
@Composable
private fun LabelValueRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Text(label, color = CtColors.TextSecondary, fontSize = 13.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = Color.White, fontSize = 13.sp, textAlign = TextAlign.End)
    }
}
