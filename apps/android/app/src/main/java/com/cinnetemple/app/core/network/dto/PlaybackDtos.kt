package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/**
 * POST /v1/playback/{titleId}/start. First start stamps the single-view window
 * (now + runtime + 30-min grace, min 3h if runtime unknown). Re-calling within
 * the window returns the SAME session with a fresh signed url (use when the
 * ~4h URL signature lapses mid-window).
 *
 * Error contract: 403 = exists but not entitled / premiere not live (show the
 * purchase sheet or countdown); 404 = title missing/unpublished/no video (hide Play).
 */
@Serializable
data class PlaybackSession(
    val titleId: String = "",
    val title: String = "",
    val url: String = "",
    val durationSeconds: Int = 0,
    /** Per-viewer string, e.g. "user@email · A1B2C3" — render as a player overlay. */
    val watermark: String = "",
    val sessionId: String = "",
    val expiresAt: String? = null,
)

/** GET /v1/playback/{titleId}/status — never opens/extends the window; use for Play-button state. */
@Serializable
data class PlaybackStatus(
    val titleId: String = "",
    val hasAccess: Boolean = false,
    val started: Boolean = false,
    val expiresAt: String? = null,
    val premiere: Boolean = false,
    val premiereLive: Boolean = false,
    val premiereStartAt: String? = null,
)

/**
 * PUT /v1/playback/{titleId}/progress — send as a ~10s player heartbeat.
 * WATCH-ONCE TRIGGER: the heartbeat that crosses progress >= 0.95 CONSUMES the
 * ACTIVE entitlement server-side — access ends permanently.
 */
@Serializable
data class ProgressRequest(
    val positionSeconds: Int,
    val durationSeconds: Int,
)

@Serializable
data class ProgressResponse(
    val titleId: String = "",
    val positionSeconds: Int = 0,
    val durationSeconds: Int = 0,
    val progress: Double = 0.0,
    val updatedAt: String = "",
)

/** GET /v1/playback/continue item — resume via POST start then seek to positionSeconds. */
@Serializable
data class ContinueWatchingItem(
    val titleId: String = "",
    val title: String = "",
    val posterUrl: String? = null,
    val heroUrl: String? = null,
    val positionSeconds: Int = 0,
    val durationSeconds: Int = 0,
    val progress: Double = 0.0,
    val updatedAt: String = "",
)

/** DELETE /v1/playback/{titleId}/progress */
@Serializable
data class ClearProgressResponse(
    val titleId: String = "",
    val cleared: Boolean = false,
)
