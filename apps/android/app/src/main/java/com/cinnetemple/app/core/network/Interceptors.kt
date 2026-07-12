package com.cinnetemple.app.core.network

import com.cinnetemple.app.core.auth.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Public auth endpoints that must NOT carry a Bearer header (a stale token on
 * e.g. login would confuse the 401 authenticator path). Shared with
 * [TokenAuthenticator], which must never refresh-retry these: a 401 there is a
 * real answer (bad credentials / bad code), not an expired session.
 */
internal val PUBLIC_AUTH_PATHS = setOf(
    "/${ApiRoutes.AUTH_REGISTER}",
    "/${ApiRoutes.AUTH_VERIFY_EMAIL}",
    "/${ApiRoutes.AUTH_LOGIN}",
    "/${ApiRoutes.AUTH_REFRESH}",
    "/${ApiRoutes.AUTH_FORGOT_PASSWORD}",
    "/${ApiRoutes.AUTH_RESET_PASSWORD}",
    "/${ApiRoutes.AUTH_GOOGLE_NATIVE}",
)

/** Attaches `Authorization: Bearer <accessToken>` from the in-memory token. */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = tokenStore.accessToken
        val isPublicAuth = request.url.encodedPath in PUBLIC_AUTH_PATHS
        if (token == null || isPublicAuth || request.header("Authorization") != null) {
            return chain.proceed(request)
        }
        return chain.proceed(
            request.newBuilder().header("Authorization", "Bearer $token").build(),
        )
    }
}

/**
 * Converts every non-2xx response into a thrown [ApiException] (problem+json
 * decoded). Runs as an application interceptor AFTER the authenticator's
 * refresh-and-retry, so a surviving 401 really means "signed out".
 */
class ProblemJsonInterceptor(private val json: Json) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.isSuccessful) return response
        val body = try {
            response.peekBody(64L * 1024).string()
        } catch (_: Exception) {
            null
        }
        response.close()
        throw ApiException.parse(json, response.code, body)
    }
}
