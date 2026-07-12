package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/**
 * Access/refresh pair. Refresh tokens ROTATE: every POST /v1/auth/refresh
 * revokes the presented token and returns a new pair — always replace BOTH.
 */
@Serializable
data class TokenPair(
    val accessToken: String,
    val refreshToken: String,
    val tokenType: String = "Bearer",
    val expiresIn: Int = 900,
)

/** POST /v1/auth/register — password >=8 chars w/ upper+lower+digit+symbol; displayName 2-60. */
@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val displayName: String,
    val deviceId: String? = null,
)

/**
 * 201 response. `tokens` is present ONLY when auto-verify is on
 * (EMAIL_VERIFICATION_REQUIRED=false — the production default): log the user in
 * immediately from it. When absent, status is PENDING_VERIFICATION and the
 * client must run verify-email -> login.
 */
@Serializable
data class RegisterResponse(
    val userId: String = "",
    val status: String = "ACTIVE",
    val tokens: TokenPair? = null,
)

@Serializable
data class VerifyEmailRequest(val email: String, val code: String)

@Serializable
data class VerifyEmailResponse(val verified: Boolean = false)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val deviceId: String? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class LogoutRequest(val refreshToken: String)

/** POST /v1/auth/google/native — idToken from Credential Manager / Google Identity. */
@Serializable
data class GoogleNativeRequest(val idToken: String)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(
    val email: String,
    val code: String,
    val newPassword: String,
)

/** Profile embedded in GET /v1/auth/me. */
@Serializable
data class UserProfile(
    val displayName: String = "",
    val avatarUrl: String? = null,
    val locale: String = "en",
)

/** GET /v1/auth/me and GET /v1/users/{id}. Key the admin UI off [isAdmin]. */
@Serializable
data class CurrentUser(
    val id: String = "",
    val email: String = "",
    val emailVerified: Boolean = false,
    val mfaEnabled: Boolean = false,
    val status: String = "ACTIVE", // ACTIVE | PENDING_VERIFICATION | SUSPENDED | DEACTIVATED
    val roles: List<String> = emptyList(),
    val isAdmin: Boolean = false,
    val profile: UserProfile? = null,
)
