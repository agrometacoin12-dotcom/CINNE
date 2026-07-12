package com.cinnetemple.app.core.network

import com.cinnetemple.app.core.auth.TokenStore
import com.cinnetemple.app.core.network.dto.TokenPair
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Fired when the refresh token is definitively dead (rotation reuse, account
 * suspended, session revoked) — the session must end. Wired to
 * SessionStore.forceUnauthenticated by the AppContainer.
 */
class SessionInvalidator {
    @Volatile
    var onInvalidated: (() -> Unit)? = null
    fun invalidate() {
        onInvalidated?.invoke()
    }
}

/**
 * OkHttp [Authenticator] implementing single-flight refresh rotation:
 * on a 401 for an authenticated call it POSTs /v1/auth/refresh {refreshToken}
 * on a bare client, replaces BOTH tokens (the backend rotates: the old refresh
 * token is revoked atomically) and retries the original request once.
 *
 * Concurrent 401s serialize on [lock]; losers see the fresh access token and
 * simply retry with it — only one refresh call ever goes out per rotation.
 * A definitive refresh failure (4xx) clears the session; transient network
 * failures just fail the request without logging the user out.
 */
class TokenAuthenticator(
    private val baseUrl: String,
    private val tokenStore: TokenStore,
    private val json: Json,
    private val invalidator: SessionInvalidator,
) : Authenticator {

    private val lock = Any()

    /** Bare client: no interceptors/authenticator, so refresh can never recurse. */
    private val refreshClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    override fun authenticate(route: Route?, response: Response): Request? {
        // Never re-auth the refresh call itself or the public auth endpoints
        // (a 401 there means bad credentials/code, not an expired session).
        if (response.request.url.encodedPath in PUBLIC_AUTH_PATHS) return null
        // Give up after one refresh-backed retry.
        if (responseCount(response) >= 2) return null

        // MAY BE NULL: the access token lives in memory only, so the first
        // authenticated call after process death goes out with no Authorization
        // header at all — that 401 must still trigger a refresh, otherwise a
        // valid stored session gets torn down on every cold start.
        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")

        synchronized(lock) {
            // Someone else already rotated while we waited — retry with the new token.
            val current = tokenStore.accessToken
            if (current != null && current != failedToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $current")
                    .build()
            }

            val refreshToken = runBlocking { tokenStore.refreshToken() }
            if (refreshToken == null) {
                invalidator.invalidate()
                return null
            }

            val pair = try {
                executeRefresh(refreshToken)
            } catch (_: IOException) {
                // Transient network problem: fail this request, keep the session.
                return null
            }

            if (pair == null) {
                // Definitive rejection (401 reuse / suspended): session is over.
                runBlocking { tokenStore.clear() }
                invalidator.invalidate()
                return null
            }

            runBlocking { tokenStore.setTokens(pair) }
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${pair.accessToken}")
                .build()
        }
    }

    /** @return the new pair, or null when the server definitively rejected the token. */
    private fun executeRefresh(refreshToken: String): TokenPair? {
        val body = json.encodeToString(
            kotlinx.serialization.json.JsonObject.serializer(),
            buildJsonObject { put("refreshToken", refreshToken) },
        ).toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(baseUrl + ApiRoutes.AUTH_REFRESH)
            .post(body)
            .build()

        refreshClient.newCall(request).execute().use { resp ->
            if (resp.isSuccessful) {
                val text = resp.body?.string() ?: return null
                return json.decodeFromString(TokenPair.serializer(), text)
            }
            // 4xx = token dead; 5xx treated as transient.
            if (resp.code in 500..599) throw IOException("Refresh failed with ${resp.code}")
            return null
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
