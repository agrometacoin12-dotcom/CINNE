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
    /** Present when playback targeted one episode of a series. */
    val episodeId: String? = null,
    val title: String = "",
    /** Present on episode sessions only. */
    val episodeName: String? = null,
    val url: String = "",
    val durationSeconds: Int = 0,
    /** Per-viewer string, e.g. "user@email · A1B2C3" — render as a player overlay. */
    val watermark: String = "",
    val sessionId: String = "",
    val expiresAt: String? = null,
)

/**
 * Optional body for POST /v1/playback/{titleId}/start. Movies send NO body
 * (unchanged); series playback targets one episode via [episodeId] — one
 * ticket unlocks the series, each episode is watch-once server-side.
 */
@Serializable
data class StartPlaybackRequest(
    val episodeId: String,
)

/** GET /v1/playback/{titleId}/status — never opens/extends the window; use for Play-button state. */
@Serializable
data class PlaybackStatus(
    val titleId: String = "",
    /** Echoed back when the status query targeted one episode. */
    val episodeId: String? = null,
    val hasAccess: Boolean = false,
    val started: Boolean = false,
    /** Episode watch-once state; present on episode status responses only. */
    val consumed: Boolean? = null,
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
    /**
     * Scopes the heartbeat to one episode of a series. Default-null is OMITTED
     * from the JSON body (explicitNulls=false), so movie heartbeats are
     * byte-identical to before.
     */
    val episodeId: String? = null,
)

@Serializable
data class ProgressResponse(
    val titleId: String = "",
    /** Present on episode heartbeats only. */
    val episodeId: String? = null,
    val positionSeconds: Int = 0,
    val durationSeconds: Int = 0,
    val progress: Double = 0.0,
    /** Episode watch-once state; present on episode heartbeats only. */
    val consumed: Boolean? = null,
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
