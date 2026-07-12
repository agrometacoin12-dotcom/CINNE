package com.cinnetemple.app.core.di

import android.content.Context
import com.cinnetemple.app.BuildConfig
import com.cinnetemple.app.core.auth.SessionStore
import com.cinnetemple.app.core.auth.TokenStore
import com.cinnetemple.app.core.network.AuthInterceptor
import com.cinnetemple.app.core.network.ProblemJsonInterceptor
import com.cinnetemple.app.core.network.SessionInvalidator
import com.cinnetemple.app.core.network.TokenAuthenticator
import com.cinnetemple.app.core.network.api.AdminApi
import com.cinnetemple.app.core.network.api.AuthApi
import com.cinnetemple.app.core.network.api.CatalogueApi
import com.cinnetemple.app.core.network.api.CommerceApi
import com.cinnetemple.app.core.network.api.PlaybackApi
import com.cinnetemple.app.core.network.api.PremieresApi
import com.cinnetemple.app.core.network.api.SessionsApi
import com.cinnetemple.app.core.network.api.UserApi
import com.cinnetemple.app.core.network.api.WatchlistApi
import androidx.compose.runtime.staticCompositionLocalOf
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Static app configuration. */
object AppConfig {
    /** From BuildConfig — https://api.cinnetemple.com in debug AND release. */
    val apiBaseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/"

    /**
     * serverClientId for Credential Manager Google sign-in. The backend accepts
     * audiences GOOGLE_CLIENT_ID (web) or GOOGLE_IOS_CLIENT_ID. TODO: confirm
     * the WEB client id of the 610578550922 project and use it here — the value
     * lives in the backend's Railway env (GOOGLE_CLIENT_ID), not in the repo.
     */
    const val GOOGLE_SERVER_CLIENT_ID =
        "610578550922-REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com"
}

/**
 * Manual DI container (the Android analog of the iOS AppContainer). One
 * instance lives on [com.cinnetemple.app.CinneTempleApplication]; composables
 * reach it through [LocalAppContainer].
 */
class AppContainer(context: Context) {

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = false
    }

    val tokenStore = TokenStore(context.applicationContext)

    private val sessionInvalidator = SessionInvalidator()

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS) // admin media uploads stream large bodies
        .authenticator(TokenAuthenticator(AppConfig.apiBaseUrl, tokenStore, json, sessionInvalidator))
        .addInterceptor(AuthInterceptor(tokenStore))
        .addInterceptor(ProblemJsonInterceptor(json))
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                        redactHeader("Authorization")
                    },
                )
            }
        }
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(AppConfig.apiBaseUrl)
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    // --- Services (grouped by domain) ---
    val authApi: AuthApi = retrofit.create(AuthApi::class.java)
    val sessionsApi: SessionsApi = retrofit.create(SessionsApi::class.java)
    val catalogueApi: CatalogueApi = retrofit.create(CatalogueApi::class.java)
    val watchlistApi: WatchlistApi = retrofit.create(WatchlistApi::class.java)
    val commerceApi: CommerceApi = retrofit.create(CommerceApi::class.java)
    val playbackApi: PlaybackApi = retrofit.create(PlaybackApi::class.java)
    val premieresApi: PremieresApi = retrofit.create(PremieresApi::class.java)
    val userApi: UserApi = retrofit.create(UserApi::class.java)
    val adminApi: AdminApi = retrofit.create(AdminApi::class.java)

    val sessionStore = SessionStore(tokenStore, authApi, appScope)

    init {
        sessionInvalidator.onInvalidated = { sessionStore.forceUnauthenticated() }
        sessionStore.bootstrap()
    }
}

/**
 * How every screen reaches the container:
 * `val container = LocalAppContainer.current` inside any composable under MainActivity.
 */
val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("AppContainer not provided — access it below MainActivity's setContent")
}
