package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.ChatMessage
import com.cinnetemple.app.core.network.dto.PremiereRoom
import com.cinnetemple.app.core.network.dto.SendChatRequest
import com.cinnetemple.app.core.network.dto.TitleDetail
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface PremieresApi {
    /** Public. All premiere titles (upcoming + live). */
    @GET(ApiRoutes.PREMIERES)
    suspend fun list(): List<TitleDetail>

    /** 404 when the title isn't a premiere. */
    @GET(ApiRoutes.PREMIERE_ROOM)
    suspend fun room(@Path("titleId") titleId: String): PremiereRoom

    /** Poll every ~3s with since=<last createdAt>. 403 without a usable entitlement. */
    @GET(ApiRoutes.PREMIERE_CHAT)
    suspend fun chat(
        @Path("titleId") titleId: String,
        @Query("since") since: String? = null,
    ): List<ChatMessage>

    /** 403 when chat closed / not entitled; body capped at 500 chars. */
    @POST(ApiRoutes.PREMIERE_CHAT)
    suspend fun sendChat(
        @Path("titleId") titleId: String,
        @Body body: SendChatRequest,
    ): ChatMessage
}
