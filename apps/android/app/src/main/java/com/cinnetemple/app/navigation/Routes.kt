package com.cinnetemple.app.navigation

import android.net.Uri

/**
 * Every destination in the app. Feature teams navigate with the builder
 * functions (never hand-rolled strings) — e.g. `nav.navigate(Routes.title(id))`.
 */
object Routes {
    // Auth flow
    const val LANDING = "landing"
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val VERIFY_EMAIL = "verifyEmail?email={email}"
    const val FORGOT_PASSWORD = "forgotPassword"
    const val RESET_PASSWORD = "resetPassword?email={email}"
    const val LOCK = "lock"

    // Main app
    const val HOME = "home"
    const val SEARCH = "search"
    const val TITLE = "title/{id}"
    const val WATCH = "watch/{id}"
    const val MOCK_CHECKOUT = "mockCheckout?url={url}&reference={reference}&titleId={titleId}"
    const val PREMIERES = "premieres"
    const val PREMIERE_ROOM = "premiereRoom/{id}"
    const val TICKETS = "tickets"
    const val WATCHLIST = "watchlist"
    const val PROFILE = "profile"
    const val SETTINGS = "settings"
    const val PURCHASE_HISTORY = "purchaseHistory"
    const val SESSIONS = "sessions"
    const val NOTIFICATIONS = "notifications"

    // Admin (gate on sessionStore.currentUser.isAdmin)
    const val ADMIN = "admin"
    const val ADMIN_MOVIE = "adminMovie?id={id}"

    // --- Builders ---
    fun verifyEmail(email: String) = "verifyEmail?email=${Uri.encode(email)}"
    fun resetPassword(email: String) = "resetPassword?email=${Uri.encode(email)}"
    fun title(id: String) = "title/$id"
    fun watch(id: String) = "watch/$id"
    fun premiereRoom(id: String) = "premiereRoom/$id"

    /** [authorizationUrl] comes from POST /v1/purchases (status=pending). */
    fun mockCheckout(authorizationUrl: String, reference: String, titleId: String) =
        "mockCheckout?url=${Uri.encode(authorizationUrl)}" +
            "&reference=${Uri.encode(reference)}&titleId=${Uri.encode(titleId)}"

    /** null id = create a new movie. */
    fun adminMovie(id: String? = null) =
        if (id == null) "adminMovie" else "adminMovie?id=${Uri.encode(id)}"

    /** The FIVE tab roots that show the floating pill bar (design contract item 1). */
    val bottomBarRoutes = listOf(HOME, PREMIERES, SEARCH, TICKETS, WATCHLIST)
}
