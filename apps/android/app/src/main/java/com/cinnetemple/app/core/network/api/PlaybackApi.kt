package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.ClearProgressResponse
import com.cinnetemple.app.core.network.dto.ContinueWatchingItem
import com.cinnetemple.app.core.network.dto.PlaybackSession
import com.cinnetemple.app.core.network.dto.PlaybackStatus
import com.cinnetemple.app.core.network.dto.ProgressRequest
import com.cinnetemple.app.core.network.dto.ProgressResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface PlaybackApi {
    /**
     * Opens (or re-uses) the single-view window and returns the signed stream URL.
     * 403 = purchasable/locked (show buy sheet or premiere countdown);
     * 404 = title/video gone (hide Play). See ApiException.isForbidden/isNotFound.
     */
    @POST(ApiRoutes.PLAYBACK_START)
    suspend fun start(@Path("titleId") titleId: String): PlaybackSession

    /** Never opens/extends the window — drive the Play button state with this. */
    @GET(ApiRoutes.PLAYBACK_STATUS)
    suspend fun status(@Path("titleId") titleId: String): PlaybackStatus

    /** ~10s heartbeat; crossing progress >= 0.95 consumes the entitlement (watch-once). */
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
