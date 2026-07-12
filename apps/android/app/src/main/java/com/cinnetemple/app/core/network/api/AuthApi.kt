package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.CurrentUser
import com.cinnetemple.app.core.network.dto.ForgotPasswordRequest
import com.cinnetemple.app.core.network.dto.GoogleNativeRequest
import com.cinnetemple.app.core.network.dto.LoginRequest
import com.cinnetemple.app.core.network.dto.LogoutRequest
import com.cinnetemple.app.core.network.dto.MessageResponse
import com.cinnetemple.app.core.network.dto.RefreshRequest
import com.cinnetemple.app.core.network.dto.RegisterRequest
import com.cinnetemple.app.core.network.dto.RegisterResponse
import com.cinnetemple.app.core.network.dto.ResetPasswordRequest
import com.cinnetemple.app.core.network.dto.SessionInfo
import com.cinnetemple.app.core.network.dto.SuccessResponse
import com.cinnetemple.app.core.network.dto.TokenPair
import com.cinnetemple.app.core.network.dto.VerifyEmailRequest
import com.cinnetemple.app.core.network.dto.VerifyEmailResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Auth + sessions. All non-2xx responses surface as
 * [com.cinnetemple.app.core.network.ApiException].
 */
interface AuthApi {
    /** 201. 409 email taken. Throttled 5/min (429). */
    @POST(ApiRoutes.AUTH_REGISTER)
    suspend fun register(@Body body: RegisterRequest): RegisterResponse

    @POST(ApiRoutes.AUTH_VERIFY_EMAIL)
    suspend fun verifyEmail(@Body body: VerifyEmailRequest): VerifyEmailResponse

    /** 401 bad credentials, 403 suspended. Throttled 10/min. */
    @POST(ApiRoutes.AUTH_LOGIN)
    suspend fun login(@Body body: LoginRequest): TokenPair

    /** THE Android Google sign-in endpoint (native idToken). */
    @POST(ApiRoutes.AUTH_GOOGLE_NATIVE)
    suspend fun googleNative(@Body body: GoogleNativeRequest): TokenPair

    /** Rotation: old refresh token is revoked; always store BOTH new tokens. */
    @POST(ApiRoutes.AUTH_REFRESH)
    suspend fun refresh(@Body body: RefreshRequest): TokenPair

    /** Always 200 (no account enumeration). Throttled 5/min. */
    @POST(ApiRoutes.AUTH_FORGOT_PASSWORD)
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): MessageResponse

    @POST(ApiRoutes.AUTH_RESET_PASSWORD)
    suspend fun resetPassword(@Body body: ResetPasswordRequest): SuccessResponse

    /** Revokes that one session; idempotent. Requires Bearer + refreshToken body. */
    @POST(ApiRoutes.AUTH_LOGOUT)
    suspend fun logout(@Body body: LogoutRequest): SuccessResponse

    @GET(ApiRoutes.AUTH_ME)
    suspend fun me(): CurrentUser
}

interface SessionsApi {
    @GET(ApiRoutes.SESSIONS)
    suspend fun list(): List<SessionInfo>

    /** 404 if not owned by caller. */
    @DELETE(ApiRoutes.SESSION)
    suspend fun revoke(@Path("id") id: String): SuccessResponse
}
