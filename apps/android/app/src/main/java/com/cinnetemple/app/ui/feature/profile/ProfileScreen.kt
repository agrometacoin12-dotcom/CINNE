package com.cinnetemple.app.ui.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.CurrentUser
import com.cinnetemple.app.core.network.dto.Entitlement
import com.cinnetemple.app.core.network.dto.UpdateProfileRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.PrimaryButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.feature.auth.GlassBackButton
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.launch

/**
 * Profile tab — account hub (iOS ProfileView, Figma 42:13833):
 *  - avatar (image or indigo-gradient initials), displayName + email from GET /v1/auth/me,
 *  - inline displayName editing via PATCH /v1/profile,
 *  - ticket summary from GET /v1/entitlements,
 *  - grouped glass rows (Settings / Studio when isAdmin / Purchase history),
 *  - sign out (POST /v1/auth/logout via SessionStore).
 */
@Composable
fun ProfileScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var user by remember { mutableStateOf(container.sessionStore.currentUser) }
    var entitlements by remember { mutableStateOf<List<Entitlement>?>(null) }

    var editing by remember { mutableStateOf(false) }
    var draftName by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var signingOut by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            user = container.authApi.me()
        } catch (_: Exception) {
            // keep whatever the session store already has
        }
        try {
            entitlements = container.commerceApi.entitlements()
        } catch (_: Exception) {
            entitlements = null
        }
    }

    fun saveName() {
        val name = draftName.trim()
        if (name.length < 2 || saving) return
        scope.launch {
            saving = true
            saveError = null
            try {
                container.userApi.updateProfile(UpdateProfileRequest(displayName = name))
                container.sessionStore.refreshUser()
                user = container.sessionStore.currentUser ?: user
                editing = false
            } catch (e: ApiException) {
                saveError = e.userMessage
            } catch (_: Exception) {
                saveError = "Couldn't save your name. Try again."
            }
            saving = false
        }
    }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(12.dp))
            // Profile is opened from the Home avatar (no Profile tab) — needs back.
            GlassBackButton(onClick = { nav.popBackStack() })
            Spacer(Modifier.height(16.dp))
            Text("Profile", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(20.dp))

            val current = user
            if (current == null) {
                Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            } else {
                ProfileHeader(
                    user = current,
                    entitlements = entitlements,
                    editing = editing,
                    onEdit = {
                        draftName = current.profile?.displayName.orEmpty()
                        saveError = null
                        editing = true
                    },
                )

                if (editing) {
                    Spacer(Modifier.height(16.dp))
                    if (saveError != null) {
                        ErrorBanner(saveError.orEmpty())
                        Spacer(Modifier.height(10.dp))
                    }
                    GlassField(
                        label = "Display name",
                        value = draftName,
                        onValueChange = { draftName = it.take(60) },
                        placeholder = "Your name",
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) {
                            GlassButton("Cancel", onClick = { editing = false }, enabled = !saving)
                        }
                        Box(Modifier.weight(1f)) {
                            PrimaryButton(
                                "Save",
                                onClick = ::saveName,
                                enabled = draftName.trim().length >= 2,
                                loading = saving,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))

                // Grouped glass list (contract item 2): Settings, Studio (admins
                // only), Purchase history — then the red Sign out below.
                Column(Modifier.fillMaxWidth().liquidGlass(radius = 16.dp)) {
                    ProfileRow(Icons.Filled.Settings, "Settings") {
                        nav.navigate(Routes.SETTINGS)
                    }
                    if (current.isAdmin) {
                        HorizontalDivider(color = CtColors.Hairline, thickness = 1.dp)
                        ProfileRow(Icons.Filled.Movie, "Studio") {
                            nav.navigate(Routes.ADMIN)
                        }
                    }
                    HorizontalDivider(color = CtColors.Hairline, thickness = 1.dp)
                    ProfileRow(Icons.Filled.ReceiptLong, "Purchase history") {
                        nav.navigate(Routes.PURCHASE_HISTORY)
                    }
                }

                Spacer(Modifier.height(24.dp))
                SignOutButton(loading = signingOut) {
                    if (signingOut) return@SignOutButton
                    signingOut = true
                    scope.launch { container.sessionStore.logout() }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun ProfileHeader(
    user: CurrentUser,
    entitlements: List<Entitlement>?,
    editing: Boolean,
    onEdit: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(user)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                user.profile?.displayName?.takeIf { it.isNotBlank() } ?: user.email.substringBefore('@'),
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                user.email,
                color = Color.White.copy(alpha = 0.55f),
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                ticketSummary(entitlements),
                color = CtColors.IndigoLight,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (!editing) {
            Spacer(Modifier.width(8.dp))
            Text(
                "Edit",
                color = CtColors.IndigoLight,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onEdit).padding(8.dp),
            )
        }
    }
}

/** 56dp circle — avatar image when present, else indigo gradient + initials. */
@Composable
private fun Avatar(user: CurrentUser) {
    val avatarUrl = user.profile?.avatarUrl
    Box(
        Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(CtColors.IndigoGradient),
        contentAlignment = Alignment.Center,
    ) {
        if (avatarUrl != null) {
            AsyncImage(
                model = avatarUrl,
                contentDescription = "Avatar",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                initials(user.profile?.displayName, user.email),
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

/** "3 tickets · 1 ready to watch" from GET /v1/entitlements — real counts only. */
private fun ticketSummary(entitlements: List<Entitlement>?): String {
    if (entitlements == null) return "Pay once · watch once"
    if (entitlements.isEmpty()) return "No tickets yet"
    val active = entitlements.count { it.status == "ACTIVE" }
    val total = entitlements.size
    val tickets = if (total == 1) "1 ticket" else "$total tickets"
    return if (active > 0) "$tickets · $active ready to watch" else tickets
}

private fun initials(name: String?, email: String): String {
    val source = name?.trim().orEmpty().ifEmpty { email.substringBefore('@') }
    val parts = source.split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}".uppercase()
        parts.isNotEmpty() -> parts[0].take(2).uppercase()
        else -> "CT"
    }
}

/** Grouped-list row: icon 18dp white-80% in a 22dp slot, 15sp label, chevron, 16dp padding. */
@Composable
private fun ProfileRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.CenterStart) {
            Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(12.dp))
        Text(label, color = Color.White, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.4f),
            modifier = Modifier.size(18.dp),
        )
    }
}

/** iOS sign-out style: #F2555A text on #BF1515@8% fill, #BF1515@25% border, radius 14, height 52. */
@Composable
private fun SignOutButton(loading: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(shape)
            .background(CtColors.SignOutBase.copy(alpha = 0.08f), shape)
            .border(1.dp, CtColors.SignOutBase.copy(alpha = 0.25f), shape)
            .clickable(enabled = !loading, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(20.dp), color = CtColors.SignOutText, strokeWidth = 2.dp)
        } else {
            Text("Sign Out", color = CtColors.SignOutText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
