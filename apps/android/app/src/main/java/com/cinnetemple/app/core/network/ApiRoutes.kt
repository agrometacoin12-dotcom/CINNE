package com.cinnetemple.app.core.network

/**
 * All backend paths, mirroring packages/shared/src/index.ts. Paths are relative
 * (no leading slash) so they compose with the Retrofit base URL, and the
 * parameterised ones use Retrofit `{placeholder}` syntax so they can be used
 * directly in service annotations.
 */
object ApiRoutes {
    const val HEALTH = "v1/health"

    // Auth
    const val AUTH_REGISTER = "v1/auth/register"
    const val AUTH_VERIFY_EMAIL = "v1/auth/verify-email"
    const val AUTH_LOGIN = "v1/auth/login"
    const val AUTH_REFRESH = "v1/auth/refresh"
    const val AUTH_LOGOUT = "v1/auth/logout"
    const val AUTH_FORGOT_PASSWORD = "v1/auth/forgot-password"
    const val AUTH_RESET_PASSWORD = "v1/auth/reset-password"
    const val AUTH_ME = "v1/auth/me"

    /** Web-only browser OAuth entry — Android must use [AUTH_GOOGLE_NATIVE]. */
    const val AUTH_GOOGLE_WEB = "v1/auth/google"
    const val AUTH_GOOGLE_NATIVE = "v1/auth/google/native"

    // Profile / users / sessions
    const val PROFILE = "v1/profile"
    const val USER = "v1/users/{id}"
    const val SESSIONS = "v1/sessions"
    const val SESSION = "v1/sessions/{id}"

    // Catalogue
    const val CATALOGUE_BROWSE = "v1/catalogue/browse"
    const val CATALOGUE_SEARCH = "v1/catalogue/search"
    const val CATALOGUE_TITLE = "v1/catalogue/titles/{id}"

    // Watchlist
    const val WATCHLIST = "v1/watchlist"
    const val WATCHLIST_TITLE = "v1/watchlist/{titleId}"

    // Commerce
    const val PURCHASES = "v1/purchases"
    const val PURCHASES_APPLE = "v1/purchases/apple" // iOS StoreKit only — do NOT call from Android
    const val PURCHASES_VERIFY = "v1/purchases/verify"
    const val ENTITLEMENTS = "v1/entitlements"
    const val PAYMENTS_WEBHOOK = "v1/payments/webhook" // server-to-server only

    // Playback
    const val PLAYBACK_START = "v1/playback/{titleId}/start"
    const val PLAYBACK_STATUS = "v1/playback/{titleId}/status"
    const val PLAYBACK_PROGRESS = "v1/playback/{titleId}/progress"
    const val PLAYBACK_CONTINUE = "v1/playback/continue"

    // Premieres
    const val PREMIERES = "v1/premieres"
    const val PREMIERE_ROOM = "v1/premieres/{titleId}/room"
    const val PREMIERE_CHAT = "v1/premieres/{titleId}/chat"

    // Notifications
    const val NOTIFICATION_DEVICES = "v1/notifications/devices"
    const val NOTIFICATION_DEVICE = "v1/notifications/devices/{token}"

    // Media (signed URLs; never construct these yourself — they come from
    // playback start / admin presign responses)
    const val MEDIA_UPLOAD = "v1/media/upload"
    const val MEDIA_STREAM = "v1/media/stream"

    // Admin
    const val ADMIN_MOVIES = "v1/admin/movies"
    const val ADMIN_MOVIE = "v1/admin/movies/{id}"
    const val ADMIN_MOVIE_FEATURED = "v1/admin/movies/{id}/featured"
    const val ADMIN_MOVIE_PREMIERE = "v1/admin/movies/{id}/premiere"
    const val ADMIN_UPLOADS_PRESIGN = "v1/admin/uploads/presign"
    const val ADMIN_UPLOADS_STAT = "v1/admin/uploads/stat"
    const val ADMIN_USERS = "v1/admin/users"
    const val ADMIN_USER_ROLES = "v1/admin/users/{id}/roles"
    const val ADMIN_USER_STATUS = "v1/admin/users/{id}/status"
    const val ADMIN_USER_VERIFY = "v1/admin/users/{id}/verify"
    const val ADMIN_PURCHASES = "v1/admin/purchases"
    const val ADMIN_AUDIT = "v1/admin/audit"
    const val ADMIN_STATS = "v1/admin/stats"
}
