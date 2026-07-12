package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/** GET /v1/sessions item — active (non-revoked, unexpired) sessions, newest first. */
@Serializable
data class SessionInfo(
    val id: String = "",
    val deviceId: String? = null,
    val userAgent: String? = null,
    val ip: String? = null,
    val createdAt: String = "",
    val expiresAt: String = "",
)

/** PATCH /v1/profile — all optional; omitted fields stay unchanged. */
@Serializable
data class UpdateProfileRequest(
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val bio: String? = null,
    val locale: String? = null,
)

@Serializable
data class ProfileResponse(
    val displayName: String = "",
    val avatarUrl: String? = null,
    val bio: String? = null,
    val locale: String = "en",
    val version: Int = 1,
)

/**
 * POST /v1/notifications/devices. WARNING: the backend DevicePlatform enum only
 * has IOS and WEB today — sending "ANDROID" is a 400 until the backend adds it.
 */
@Serializable
data class RegisterDeviceRequest(
    val platform: String,
    val token: String,
)
