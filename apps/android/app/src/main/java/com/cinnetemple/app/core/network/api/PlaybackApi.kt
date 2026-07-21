package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.ClearProgressResponse
import com.cinnetemple.app.core.network.dto.ContinueWatchingItem
import com.cinnetemple.app.core.network.dto.PlaybackSession
import com.cinnetemple.app.core.network.dto.PlaybackStatus
import com.cinnetemple.app.core.network.dto.ProgressRequest
import com.cinnetemple.app.core.network.dto.ProgressResponse
import com.cinnetemple.app.core.network.dto.StartPlaybackRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface PlaybackApi {
    /**
     * Opens (or re-uses) the single-view window and returns the signed stream URL.
     * 403 = purchasable/locked (show buy sheet or premiere countdown);
     * 404 = title/video gone (hide Play). See ApiException.isForbidden/isNotFound.
     * Movies only — no body, byte-identical to the pre-series flow.
     */
    @POST(ApiRoutes.PLAYBACK_START)
    suspend fun start(@Path("titleId") titleId: String): PlaybackSession

    /**
     * Series: start ONE episode ({episodeId} body). One ticket covers the whole
     * series; each episode is watch-once. 403 with "already been watched" /
     * "viewing window ... has closed" = that episode is spent (unrecoverable).
     */
    @POST(ApiRoutes.PLAYBACK_START)
    suspend fun startEpisode(
        @Path("titleId") titleId: String,
        @Body body: StartPlaybackRequest,
    ): PlaybackSession

    /**
     * Never opens/extends the window — drive the Play button state with this.
     * Pass [episodeId] to query one episode's watch-once state (`consumed`);
     * null keeps the movie/series-level query identical to before.
     */
    @GET(ApiRoutes.PLAYBACK_STATUS)
    suspend fun status(
        @Path("titleId") titleId: String,
        @Query("episodeId") episodeId: String? = null,
    ): PlaybackStatus

    /**
     * ~10s heartbeat; crossing progress >= 0.95 consumes the entitlement
     * (watch-once). Set [ProgressRequest.episodeId] when playing an episode —
     * the same threshold then consumes just that episode.
     */
    @PUT(ApiRoutes.PLAYBACK_PROGRESS)
    suspend fun progress(
        @Path("titleId") titleId: String,
        @Body body: ProgressRequest,
    ): ProgressResponse

    /** Home rail; items auto-drop when >95% watched or entitlement unusable. */
    @GET(ApiRoutes.PLAYBACK_CONTINUE)
    suspend fun continueWatching(): List<ContinueWatchingItem>

    /** Manual removal from Continue watching; idempotent. */
    @DELETE(ApiRoutes.PLAYBACK_PROGRESS)
    suspend fun clearProgress(@Path("titleId") titleId: String): ClearProgressResponse
}
