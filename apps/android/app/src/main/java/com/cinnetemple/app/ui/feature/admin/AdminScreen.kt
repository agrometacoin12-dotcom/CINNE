package com.cinnetemple.app.ui.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.cinnetemple.app.core.auth.SessionPhase
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.AdminPurchase
import com.cinnetemple.app.core.network.dto.AdminStats
import com.cinnetemple.app.core.network.dto.AdminTitle
import com.cinnetemple.app.core.network.dto.AdminUser
import com.cinnetemple.app.core.network.dto.AuditEntry
import com.cinnetemple.app.core.network.dto.FeaturedRequest
import com.cinnetemple.app.core.network.dto.UpdateRolesRequest
import com.cinnetemple.app.core.network.dto.UpdateUserStatusRequest
import com.cinnetemple.app.core.util.Money
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.GlassField
import com.cinnetemple.app.ui.components.IndigoGlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.components.posterFallbackBrush
import com.cinnetemple.app.ui.theme.CtColors
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

private val ADMIN_TABS = listOf("Movies", "Members", "Sales", "Activity")

/**
 * Studio admin console (web-parity). Entry is gated on /v1/auth/me.isAdmin —
 * every admin route (/v1/admin/...) 403s for non-admins anyway.
 */
@Composable
fun AdminScreen(nav: NavController) {
    val container = LocalAppContainer.current
    val phase by container.sessionStore.phase.collectAsStateWithLifecycle()
    val user = (phase as? SessionPhase.Authenticated)?.user

    if (user == null || !user.isAdmin) {
        // Safety net — the entry point is hidden for non-admins.
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(32.dp),
            ) {
                Text(
                    "Admin access required",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "This area is reserved for CinneTemple staff.",
                    color = CtColors.TextSecondary,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(20.dp))
                GlassButton("Go back", onClick = { nav.popBackStack() })
            }
        }
        return
    }

    var tab by rememberSaveable { mutableIntStateOf(0) }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).liquidGlass(radius = 20.dp).clickable { nav.popBackStack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Studio", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Text(
                    "CinneTemple admin console",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        AdminSegmentedTabs(selected = tab, onSelect = { tab = it })
        Spacer(Modifier.height(14.dp))
        when (tab) {
            0 -> MoviesTab(nav)
            1 -> MembersTab(selfId = user.id)
            2 -> SalesTab()
            else -> ActivityTab()
        }
    }
}

@Composable
private fun AdminSegmentedTabs(selected: Int, onSelect: (Int) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.04f), RoundedCornerShape(12.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ADMIN_TABS.forEachIndexed { index, label ->
            val active = index == selected
            Box(
                Modifier
                    .weight(1f)
                    .height(34.dp)
                    .let {
                        if (active) {
                            it.liquidGlass(radius = 10.dp, tint = CtColors.Brand, elevation = 0.dp)
                        } else {
                            it.clip(RoundedCornerShape(10.dp))
                        }
                    }
                    .clickable { onSelect(index) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    fontSize = 12.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (active) Color.White else CtColors.TextSecondary,
                    maxLines = 1,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// MOVIES — stats cards + catalogue list with featured toggle
// ---------------------------------------------------------------------------

@Composable
private fun MoviesTab(nav: NavController) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var stats by remember { mutableStateOf<AdminStats?>(null) }
    var movies by remember { mutableStateOf(listOf<AdminTitle>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        error = null
        try {
            coroutineScope {
                val s = async { container.adminApi.stats() }
                val m = async { container.adminApi.movies() }
                stats = s.await()
                movies = m.await()
            }
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    fun toggleFeatured(movie: AdminTitle, featured: Boolean) {
        scope.launch {
            try {
                val updated = container.adminApi.setFeatured(movie.id, FeaturedRequest(featured))
                // featured:true atomically un-features every other title server-side.
                movies = movies.map {
                    when {
                        it.id == updated.id -> updated
                        updated.featured -> it.copy(featured = false)
                        else -> it
                    }
                }
            } catch (e: Exception) {
                error = e.adminFriendlyMessage()
            }
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "stats") { StatsRow(stats) }
        item(key = "new-movie") {
            IndigoGlassButton("+ New Movie", onClick = { nav.navigate(Routes.adminMovie()) })
        }
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        if (loading && movies.isEmpty()) {
            item(key = "spinner") { CenteredSpinner() }
        } else if (!loading && movies.isEmpty() && error == null) {
            item(key = "empty") { EmptyNote("No movies yet — create your first title.") }
        }
        items(movies, key = { it.id }) { movie ->
            AdminMovieRow(
                movie = movie,
                onOpen = { nav.navigate(Routes.adminMovie(movie.id)) },
                onFeatured = { toggleFeatured(movie, it) },
            )
        }
    }
}

@Composable
private fun StatsRow(stats: AdminStats?) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (stats == null) {
            listOf("Members", "Titles", "Published", "Tickets sold").forEach { StatCard("—", it) }
        } else {
            StatCard(formatCount(stats.users), "Members")
            StatCard(formatCount(stats.titles), "Titles")
            StatCard(formatCount(stats.published), "Published")
            StatCard(formatCount(stats.purchases), "Tickets sold")
            StatCard(formatCount(stats.activeEntitlements), "Active tickets")
            if (stats.revenue.isEmpty()) {
                StatCard(Money.formatMinor(0), "Revenue")
            } else {
                stats.revenue.forEach {
                    StatCard(Money.formatMinor(it.totalMinor, it.currency), "Revenue (${it.currency})")
                }
            }
        }
    }
}

@Composable
private fun StatCard(value: String, label: String) {
    Column(
        Modifier
            .liquidGlass(radius = 14.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(value, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(label, color = CtColors.TextSecondary, fontSize = 11.sp, maxLines = 1)
    }
}

@Composable
private fun AdminMovieRow(movie: AdminTitle, onOpen: () -> Unit, onFeatured: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 14.dp)
            .clickable(onClick = onOpen)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(44.dp, 66.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(posterFallbackBrush(movie.id)),
        ) {
            if (movie.posterUrl != null) {
                AsyncImage(
                    model = movie.posterUrl,
                    contentDescription = movie.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                movie.title.ifBlank { "Untitled" },
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                "${movie.year} • ${Money.priceLabel(movie.priceMinor, movie.currency)}",
                color = CtColors.TextSecondary,
                fontSize = 12.sp,
                maxLines = 1,
            )
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (movie.status == "published") {
                    AdminPill("Published", AdminGreen)
                } else {
                    AdminPill("Draft", CtColors.TextSecondary)
                }
                if (movie.featured) AdminPill("Featured", CtColors.Star)
                if (movie.isPremiere) AdminPill("Premiere", CtColors.IndigoLight)
                if (!movie.hasVideo) AdminPill("No video", CtColors.SignOutText)
            }
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Switch(
                checked = movie.featured,
                onCheckedChange = onFeatured,
                colors = adminSwitchColors(),
            )
            Text("Hero", color = CtColors.TextSecondary, fontSize = 10.sp)
        }
    }
}

// ---------------------------------------------------------------------------
// MEMBERS — search + paginated user list with role/status/verify actions
// ---------------------------------------------------------------------------

private enum class MemberActionKind { PROMOTE, DEMOTE, SUSPEND, REACTIVATE, VERIFY }

private data class MemberAction(
    val kind: MemberActionKind,
    val user: AdminUser,
    val label: String,
    val message: String,
)

@Composable
private fun MembersTab(selfId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var users by remember { mutableStateOf(listOf<AdminUser>()) }
    var total by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var rowErrors by remember { mutableStateOf(mapOf<String, String>()) }
    var rowBusy by remember { mutableStateOf(setOf<String>()) }
    var confirm by remember { mutableStateOf<MemberAction?>(null) }

    suspend fun load(reset: Boolean) {
        if (reset) loading = true else loadingMore = true
        error = null
        try {
            val resp = container.adminApi.users(
                query = query.trim().ifBlank { null },
                take = 50,
                skip = if (reset) 0 else users.size,
            )
            users = if (reset) resp.users else users + resp.users
            total = resp.total
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
        loading = false
        loadingMore = false
    }

    LaunchedEffect(query) {
        if (query.isNotEmpty()) delay(350) // debounce typing
        load(reset = true)
    }

    fun runAction(action: MemberAction) {
        val target = action.user
        rowBusy = rowBusy + target.id
        rowErrors = rowErrors - target.id
        scope.launch {
            try {
                val updated = when (action.kind) {
                    MemberActionKind.PROMOTE -> container.adminApi.setUserRoles(
                        target.id,
                        UpdateRolesRequest((target.roles + "admin").distinct()),
                    )
                    MemberActionKind.DEMOTE -> container.adminApi.setUserRoles(
                        target.id,
                        UpdateRolesRequest((target.roles - "admin").ifEmpty { listOf("user") }),
                    )
                    MemberActionKind.SUSPEND -> container.adminApi.setUserStatus(
                        target.id,
                        UpdateUserStatusRequest("SUSPENDED"),
                    )
                    MemberActionKind.REACTIVATE -> container.adminApi.setUserStatus(
                        target.id,
                        UpdateUserStatusRequest("ACTIVE"),
                    )
                    MemberActionKind.VERIFY -> container.adminApi.verifyUser(target.id)
                }
                users = users.map { if (it.id == updated.id) updated else it }
            } catch (e: Exception) {
                rowErrors = rowErrors + (target.id to e.adminFriendlyMessage())
            }
            rowBusy = rowBusy - target.id
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "search") {
            GlassField(
                label = "",
                value = query,
                onValueChange = { query = it },
                placeholder = "Search members by email or name…",
            )
        }
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        if (loading && users.isEmpty()) {
            item(key = "spinner") { CenteredSpinner() }
        } else if (!loading && users.isEmpty() && error == null) {
            item(key = "empty") { EmptyNote("No members found.") }
        }
        items(users, key = { it.id }) { member ->
            MemberRow(
                member = member,
                isSelf = member.id == selfId,
                busy = member.id in rowBusy,
                rowError = rowErrors[member.id],
                onAction = { confirm = it },
            )
        }
        if (users.size < total) {
            item(key = "load-more") {
                GlassButton(
                    if (loadingMore) "Loading…" else "Load more (${total - users.size} remaining)",
                    onClick = { scope.launch { load(reset = false) } },
                    enabled = !loadingMore,
                )
            }
        }
    }

    confirm?.let { action ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            containerColor = CtColors.BgSurface,
            title = { Text(action.label, color = Color.White) },
            text = { Text(action.message, color = CtColors.TextSecondary) },
            confirmButton = {
                TextButton(onClick = {
                    runAction(action)
                    confirm = null
                }) { Text(action.label, color = CtColors.IndigoLight) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = null }) {
                    Text("Cancel", color = CtColors.TextSecondary)
                }
            },
        )
    }
}

@Composable
private fun MemberRow(
    member: AdminUser,
    isSelf: Boolean,
    busy: Boolean,
    rowError: String?,
    onAction: (MemberAction) -> Unit,
) {
    val isAdminUser = "admin" in member.roles
    val suspended = member.status == "SUSPENDED"
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 14.dp)
            .padding(12.dp),
    ) {
        Text(
            member.displayName?.takeIf { it.isNotBlank() } ?: member.email,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!member.displayName.isNullOrBlank()) {
            Text(
                member.email,
                color = CtColors.TextSecondary,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Joined ${formatIsoShort(member.createdAt)} • ${member.purchases} purchase" +
                if (member.purchases == 1) "" else "s",
            color = CtColors.TextSecondary,
            fontSize = 10.5.sp,
        )
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (isAdminUser) AdminPill("Admin", CtColors.IndigoLight)
            when (member.status) {
                "ACTIVE" -> AdminPill("Active", AdminGreen)
                "SUSPENDED" -> AdminPill("Suspended", CtColors.SignOutText)
                else -> AdminPill(member.status, AdminAmber)
            }
            if (!member.emailVerified) AdminPill("Unverified", AdminAmber)
            if (isSelf) AdminPill("You", CtColors.TextSecondary)
        }
        Spacer(Modifier.height(8.dp))
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                color = CtColors.IndigoLight,
                strokeWidth = 2.dp,
            )
        } else {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (!isAdminUser) {
                    ActionChip("Promote to admin", CtColors.IndigoLight) {
                        onAction(
                            MemberAction(
                                MemberActionKind.PROMOTE,
                                member,
                                "Promote to admin",
                                "Give ${member.email} full admin access to the Studio console?",
                            ),
                        )
                    }
                } else if (!isSelf) {
                    // Admins cannot remove their own admin role (server 403s too).
                    ActionChip("Demote", AdminAmber) {
                        onAction(
                            MemberAction(
                                MemberActionKind.DEMOTE,
                                member,
                                "Demote admin",
                                "Remove admin access from ${member.email}?",
                            ),
                        )
                    }
                }
                if (suspended) {
                    ActionChip("Reactivate", AdminGreen) {
                        onAction(
                            MemberAction(
                                MemberActionKind.REACTIVATE,
                                member,
                                "Reactivate account",
                                "Restore sign-in for ${member.email}?",
                            ),
                        )
                    }
                } else {
                    ActionChip("Suspend", CtColors.SignOutText) {
                        onAction(
                            MemberAction(
                                MemberActionKind.SUSPEND,
                                member,
                                "Suspend account",
                                "Block sign-in, Google sign-in and session refresh for ${member.email}?",
                            ),
                        )
                    }
                }
                if (!member.emailVerified) {
                    ActionChip("Force verify", CtColors.IndigoLight) {
                        onAction(
                            MemberAction(
                                MemberActionKind.VERIFY,
                                member,
                                "Force verify email",
                                "Mark ${member.email} as verified without a code?",
                            ),
                        )
                    }
                }
            }
        }
        if (rowError != null) {
            Spacer(Modifier.height(6.dp))
            Text(rowError, color = CtColors.SignOutText, fontSize = 11.5.sp)
        }
    }
}

// ---------------------------------------------------------------------------
// SALES — purchases with q/status filters + load-more
// ---------------------------------------------------------------------------

@Composable
private fun SalesTab() {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<AdminPurchase>()) }
    var total by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load(reset: Boolean) {
        if (reset) loading = true else loadingMore = true
        error = null
        try {
            val resp = container.adminApi.purchases(
                query = query.trim().ifBlank { null },
                status = statusFilter,
                take = 50,
                skip = if (reset) 0 else items.size,
            )
            items = if (reset) resp.items else items + resp.items
            total = resp.total
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
        loading = false
        loadingMore = false
    }

    LaunchedEffect(query, statusFilter) {
        if (query.isNotEmpty()) delay(350)
        load(reset = true)
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "search") {
            GlassField(
                label = "",
                value = query,
                onValueChange = { query = it },
                placeholder = "Search by title or buyer…",
            )
        }
        item(key = "filters") {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterPill("All", statusFilter == null) { statusFilter = null }
                listOf("PENDING", "PAID", "FAILED", "REFUNDED").forEach { status ->
                    FilterPill(
                        status.lowercase().replaceFirstChar { it.uppercase() },
                        statusFilter == status,
                    ) { statusFilter = status }
                }
            }
        }
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        if (loading && items.isEmpty()) {
            item(key = "spinner") { CenteredSpinner() }
        } else if (!loading && items.isEmpty() && error == null) {
            item(key = "empty") { EmptyNote("No sales match these filters.") }
        }
        items(items, key = { it.id }) { sale -> SaleRow(sale) }
        if (items.size < total) {
            item(key = "load-more") {
                GlassButton(
                    if (loadingMore) "Loading…" else "Load more (${total - items.size} remaining)",
                    onClick = { scope.launch { load(reset = false) } },
                    enabled = !loadingMore,
                )
            }
        }
    }
}

@Composable
private fun SaleRow(sale: AdminPurchase) {
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 14.dp)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                sale.titleName.ifBlank { "Unknown title" },
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                Money.formatMinor(sale.amountMinor, sale.currency),
                color = CtColors.IndigoLight,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            sale.userDisplayName?.takeIf { it.isNotBlank() }?.let { "$it (${sale.userEmail})" }
                ?: sale.userEmail,
            color = CtColors.TextSecondary,
            fontSize = 11.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Text(formatIsoShort(sale.createdAt), color = CtColors.TextSecondary, fontSize = 10.5.sp)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            AdminPill(sale.provider, CtColors.TextSecondary)
            AdminPill(sale.status, purchaseStatusColor(sale.status))
            if (sale.isGift) AdminPill("Gift", CtColors.IndigoLight)
            sale.entitlementStatus?.let { AdminPill("Ticket: $it", entitlementColor(it)) }
        }
    }
}

@Composable
private fun FilterPill(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .height(32.dp)
            .let {
                if (active) {
                    it.liquidGlass(radius = 10.dp, tint = CtColors.Brand, elevation = 0.dp)
                } else {
                    it
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White.copy(alpha = 0.04f))
                }
            }
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (active) Color.White else CtColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

// ---------------------------------------------------------------------------
// ACTIVITY — paginated audit feed with expandable metadata
// ---------------------------------------------------------------------------

private val PrettyJson = Json { prettyPrint = true }

@Composable
private fun ActivityTab() {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf(listOf<AuditEntry>()) }
    var total by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var expanded by remember { mutableStateOf(setOf<String>()) }

    suspend fun load(reset: Boolean) {
        if (reset) loading = true else loadingMore = true
        error = null
        try {
            val resp = container.adminApi.audit(take = 50, skip = if (reset) 0 else entries.size)
            entries = if (reset) resp.items else entries + resp.items
            total = resp.total
        } catch (e: Exception) {
            error = e.adminFriendlyMessage()
        }
        loading = false
        loadingMore = false
    }

    LaunchedEffect(Unit) { load(reset = true) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        error?.let { message -> item(key = "error") { ErrorBanner(message) } }
        if (loading && entries.isEmpty()) {
            item(key = "spinner") { CenteredSpinner() }
        } else if (!loading && entries.isEmpty() && error == null) {
            item(key = "empty") { EmptyNote("No activity recorded yet.") }
        }
        items(entries, key = { it.id }) { entry ->
            AuditRow(
                entry = entry,
                expanded = entry.id in expanded,
                onToggle = {
                    expanded = if (entry.id in expanded) expanded - entry.id else expanded + entry.id
                },
            )
        }
        if (entries.size < total) {
            item(key = "load-more") {
                GlassButton(
                    if (loadingMore) "Loading…" else "Load more (${total - entries.size} remaining)",
                    onClick = { scope.launch { load(reset = false) } },
                    enabled = !loadingMore,
                )
            }
        }
    }
}

@Composable
private fun AuditRow(entry: AuditEntry, expanded: Boolean, onToggle: () -> Unit) {
    val hasMetadata = entry.metadata != null && entry.metadata.isNotEmpty()
    Column(
        Modifier
            .fillMaxWidth()
            .liquidGlass(radius = 12.dp)
            .let { if (hasMetadata) it.clickable(onClick = onToggle) else it }
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                entry.action,
                color = CtColors.IndigoLight,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (hasMetadata) {
                Text(
                    if (expanded) "▾" else "▸",
                    color = CtColors.TextSecondary,
                    fontSize = 12.sp,
                )
            }
        }
        Spacer(Modifier.height(3.dp))
        val meta = buildList {
            entry.actorEmail?.let { add(it) }
            entry.entity?.let { add(it + (entry.entityId?.let { id -> " ${id.take(8)}" } ?: "")) }
            add(formatIsoShort(entry.createdAt))
        }.joinToString(" • ")
        Text(meta, color = CtColors.TextSecondary, fontSize = 10.5.sp, maxLines = 2)
        if (expanded && entry.metadata != null) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(CtColors.Track, RoundedCornerShape(8.dp))
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                    .padding(10.dp),
            ) {
                Text(
                    PrettyJson.encodeToString(JsonObject.serializer(), entry.metadata),
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 10.5.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shared admin helpers (also used by AdminMovieScreen — keep internal)
// ---------------------------------------------------------------------------

internal val AdminGreen = Color(0xFF22C55E)
internal val AdminAmber = Color(0xFFF59E0B)

@Composable
internal fun AdminPill(text: String, color: Color) {
    Text(
        text.uppercase(Locale.US),
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.4.sp,
        color = color,
        maxLines = 1,
        modifier = Modifier
            .background(color.copy(alpha = 0.16f), RoundedCornerShape(6.dp))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun ActionChip(text: String, color: Color, onClick: () -> Unit) {
    Text(
        text,
        color = color,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
internal fun CenteredSpinner() {
    Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = CtColors.IndigoLight)
    }
}

@Composable
internal fun EmptyNote(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}

@Composable
internal fun adminSwitchColors() = SwitchDefaults.colors(
    checkedTrackColor = CtColors.Brand,
    checkedThumbColor = Color.White,
    uncheckedTrackColor = CtColors.Track,
    uncheckedThumbColor = CtColors.TextSecondary,
    uncheckedBorderColor = Color.White.copy(alpha = 0.25f),
)

internal fun Throwable.adminFriendlyMessage(): String = when (this) {
    is ApiException -> userMessage
    else -> message ?: "Something went wrong — check your connection."
}

private fun formatCount(n: Int): String = String.format(Locale.US, "%,d", n)

internal fun purchaseStatusColor(status: String): Color = when (status) {
    "PAID" -> AdminGreen
    "PENDING" -> AdminAmber
    "FAILED" -> CtColors.SignOutText
    else -> CtColors.TextSecondary // REFUNDED etc.
}

internal fun entitlementColor(status: String): Color = when (status) {
    "ACTIVE" -> AdminGreen
    "EXPIRED" -> AdminAmber
    "CONSUMED" -> CtColors.IndigoLight
    "REVOKED" -> CtColors.SignOutText
    else -> CtColors.TextSecondary
}

private val ISO_PARSE_PATTERNS = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss",
)

/** "2026-07-11T09:30:00.000Z" -> "Jul 11, 10:30" (device timezone). minSdk 24 — no java.time. */
internal fun formatIsoShort(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    for (pattern in ISO_PARSE_PATTERNS) {
        try {
            val parser = SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val date = parser.parse(iso) ?: continue
            return SimpleDateFormat("MMM d, HH:mm", Locale.US).format(date)
        } catch (_: ParseException) {
            // try the next pattern
        }
    }
    return iso.take(16).replace("T", " ")
}
