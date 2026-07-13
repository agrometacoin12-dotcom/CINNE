package com.cinnetemple.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.cinnetemple.app.core.auth.SessionPhase
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.feature.admin.AdminMovieScreen
import com.cinnetemple.app.ui.feature.admin.AdminScreen
import com.cinnetemple.app.ui.feature.auth.ForgotPasswordScreen
import com.cinnetemple.app.ui.feature.auth.LandingScreen
import com.cinnetemple.app.ui.feature.auth.LockScreen
import com.cinnetemple.app.ui.feature.auth.LoginScreen
import com.cinnetemple.app.ui.feature.auth.RegisterScreen
import com.cinnetemple.app.ui.feature.auth.ResetPasswordScreen
import com.cinnetemple.app.ui.feature.auth.VerifyEmailScreen
import com.cinnetemple.app.ui.feature.checkout.MockCheckoutScreen
import com.cinnetemple.app.ui.feature.home.HomeScreen
import com.cinnetemple.app.ui.feature.notifications.NotificationsScreen
import com.cinnetemple.app.ui.feature.premieres.PremiereRoomScreen
import com.cinnetemple.app.ui.feature.premieres.PremieresScreen
import com.cinnetemple.app.ui.feature.profile.ProfileScreen
import com.cinnetemple.app.ui.feature.profile.PurchaseHistoryScreen
import com.cinnetemple.app.ui.feature.search.SearchScreen
import com.cinnetemple.app.ui.feature.settings.SessionsScreen
import com.cinnetemple.app.ui.feature.settings.SettingsScreen
import com.cinnetemple.app.ui.feature.tickets.TicketsScreen
import com.cinnetemple.app.ui.feature.title.TitleDetailScreen
import com.cinnetemple.app.ui.feature.watch.WatchScreen
import com.cinnetemple.app.ui.feature.watchlist.WatchlistScreen
import com.cinnetemple.app.ui.theme.CtColors

private data class TabSpec(val route: String, val label: String, val icon: ImageVector)

/**
 * The FIVE bottom tabs of the cross-platform design contract:
 * Home / Premieres / Search / Tickets / My List. Profile & Settings live
 * behind the Home avatar button, never in the tab bar.
 */
private val TABS = listOf(
    TabSpec(Routes.HOME, "Home", Icons.Filled.Home),
    TabSpec(Routes.PREMIERES, "Premieres", Icons.Filled.LiveTv),
    TabSpec(Routes.SEARCH, "Search", Icons.Filled.Search),
    TabSpec(Routes.TICKETS, "Tickets", Icons.Filled.ConfirmationNumber),
    TabSpec(Routes.WATCHLIST, "My List", Icons.Filled.Bookmark),
)

/**
 * Root of the app: routes the SessionStore phase (loading / locked /
 * unauthenticated / authenticated) into the NavHost and floats the 5-tab
 * pill bar over the authenticated tab roots.
 */
@Composable
fun CinneTempleApp() {
    val container = LocalAppContainer.current
    val navController = rememberNavController()
    val phase by container.sessionStore.phase.collectAsStateWithLifecycle()

    // Re-route when the session phase CLASS changes (not on every /me refresh).
    val phaseKey = when (phase) {
        SessionPhase.Loading -> "loading"
        SessionPhase.Locked -> "locked"
        SessionPhase.Unauthenticated -> "unauthenticated"
        is SessionPhase.Authenticated -> "authenticated"
    }
    LaunchedEffect(phaseKey) {
        when (phaseKey) {
            "authenticated" -> navController.navigateClearing(Routes.HOME)
            "unauthenticated" -> navController.navigateClearing(Routes.LANDING)
            "locked" -> navController.navigateClearing(Routes.LOCK)
        }
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = phase is SessionPhase.Authenticated && currentRoute in Routes.bottomBarRoutes

    Box(Modifier.fillMaxSize().background(CtColors.BgBase)) {
        if (phase == SessionPhase.Loading) {
            LoadingSplash()
        } else {
            Scaffold(containerColor = Color.Transparent) { padding ->
                NavHost(
                    navController = navController,
                    startDestination = Routes.LANDING,
                    modifier = Modifier.fillMaxSize().padding(padding),
                ) {
                    appDestinations(navController)
                }
            }
            // Floating pill bar OVER the content (screens keep ~96dp clearance).
            if (showBottomBar) {
                FloatingTabBar(
                    navController = navController,
                    currentRoute = currentRoute,
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }
        }
    }
}

@Composable
private fun LoadingSplash() {
    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        CircularProgressIndicator(
            color = Color.White,
            modifier = Modifier.align(Alignment.Center),
        )
    }
}

/**
 * Contract item 1 — floating rounded pill: translucent dark container,
 * 16dp side/bottom margins, indigo capsule behind the active tab.
 */
@Composable
private fun FloatingTabBar(
    navController: NavHostController,
    currentRoute: String?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp)
            .fillMaxWidth()
            .height(64.dp)
            .liquidGlass(radius = 32.dp, elevation = 16.dp)
            .background(CtColors.BgSidebar.copy(alpha = 0.86f))
            .padding(horizontal = 6.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TABS.forEach { tab ->
            val selected = currentRoute == tab.route
            val tint = if (selected) CtColors.IndigoBright else Color.White
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(27.dp))
                    .background(if (selected) CtColors.Brand.copy(alpha = 0.18f) else Color.Transparent)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        navController.navigate(tab.route) {
                            popUpTo(Routes.HOME) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        tab.icon,
                        contentDescription = tab.label,
                        tint = tint,
                        modifier = Modifier.size(22.dp),
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        tab.label,
                        color = tint,
                        fontSize = 10.sp,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }
    }
}

private fun NavHostController.navigateClearing(route: String) {
    navigate(route) {
        popUpTo(0) { inclusive = true }
        launchSingleTop = true
    }
}

/**
 * ALL destinations. Each screen lives in its own file under
 * ui/feature/<area>/ so feature teams replace file contents without collisions.
 */
private fun androidx.navigation.NavGraphBuilder.appDestinations(nav: NavHostController) {
    // --- Auth flow ---
    composable(Routes.LANDING) { LandingScreen(nav) }
    composable(Routes.LOGIN) { LoginScreen(nav) }
    composable(Routes.REGISTER) { RegisterScreen(nav) }
    composable(
        Routes.VERIFY_EMAIL,
        arguments = listOf(navArgument("email") { type = NavType.StringType; defaultValue = "" }),
    ) { entry ->
        VerifyEmailScreen(nav, email = entry.arguments?.getString("email").orEmpty())
    }
    composable(Routes.FORGOT_PASSWORD) { ForgotPasswordScreen(nav) }
    composable(
        Routes.RESET_PASSWORD,
        arguments = listOf(navArgument("email") { type = NavType.StringType; defaultValue = "" }),
    ) { entry ->
        ResetPasswordScreen(nav, email = entry.arguments?.getString("email").orEmpty())
    }
    composable(Routes.LOCK) { LockScreen(nav) }

    // --- Main tabs (5) ---
    composable(Routes.HOME) { HomeScreen(nav) }
    composable(Routes.PREMIERES) { PremieresScreen(nav) }
    composable(Routes.SEARCH) { SearchScreen(nav) }
    composable(Routes.TICKETS) { TicketsScreen(nav) }
    composable(Routes.WATCHLIST) { WatchlistScreen(nav) }

    // --- Avatar flow: Profile hub + its children ---
    composable(Routes.PROFILE) { ProfileScreen(nav) }
    composable(Routes.SETTINGS) { SettingsScreen(nav) }
    composable(Routes.PURCHASE_HISTORY) { PurchaseHistoryScreen(nav) }

    // --- Detail / playback / commerce ---
    composable(
        Routes.TITLE,
        arguments = listOf(navArgument("id") { type = NavType.StringType }),
    ) { entry ->
        TitleDetailScreen(nav, titleId = entry.arguments?.getString("id").orEmpty())
    }
    composable(
        Routes.WATCH,
        arguments = listOf(navArgument("id") { type = NavType.StringType }),
    ) { entry ->
        WatchScreen(nav, titleId = entry.arguments?.getString("id").orEmpty())
    }
    composable(
        Routes.MOCK_CHECKOUT,
        arguments = listOf(
            navArgument("url") { type = NavType.StringType; defaultValue = "" },
            navArgument("reference") { type = NavType.StringType; defaultValue = "" },
            navArgument("titleId") { type = NavType.StringType; defaultValue = "" },
        ),
    ) { entry ->
        MockCheckoutScreen(
            nav,
            authorizationUrl = entry.arguments?.getString("url").orEmpty(),
            reference = entry.arguments?.getString("reference").orEmpty(),
            titleId = entry.arguments?.getString("titleId").orEmpty(),
        )
    }
    composable(
        Routes.PREMIERE_ROOM,
        arguments = listOf(navArgument("id") { type = NavType.StringType }),
    ) { entry ->
        PremiereRoomScreen(nav, titleId = entry.arguments?.getString("id").orEmpty())
    }

    // --- Secondary ---
    composable(Routes.SESSIONS) { SessionsScreen(nav) }
    composable(Routes.NOTIFICATIONS) { NotificationsScreen(nav) }

    // --- Admin ---
    composable(Routes.ADMIN) { AdminScreen(nav) }
    composable(
        Routes.ADMIN_MOVIE,
        arguments = listOf(
            navArgument("id") { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
    ) { entry ->
        AdminMovieScreen(nav, movieId = entry.arguments?.getString("id"))
    }
}
