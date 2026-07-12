package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.AddWatchlistRequest
import com.cinnetemple.app.core.network.dto.BrowseResponse
import com.cinnetemple.app.core.network.dto.SearchResponse
import com.cinnetemple.app.core.network.dto.SuccessResponse
import com.cinnetemple.app.core.network.dto.TitleDetail
import com.cinnetemple.app.core.network.dto.WatchlistItem
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface CatalogueApi {
    /** Public. hero = featured title or null; empty rows omitted. */
    @GET(ApiRoutes.CATALOGUE_BROWSE)
    suspend fun browse(): BrowseResponse

    /** Public. Only published titles. */
    @GET(ApiRoutes.CATALOGUE_SEARCH)
    suspend fun search(@Query("q") query: String): SearchResponse

    /** Public. 404 unknown; 400 non-UUID id. */
    @GET(ApiRoutes.CATALOGUE_TITLE)
    suspend fun title(@Path("id") id: String): TitleDetail
}

interface WatchlistApi {
    /** Newest first; hide rows whose `title` is null. */
    @GET(ApiRoutes.WATCHLIST)
    suspend fun list(): List<WatchlistItem>

    /** Idempotent upsert; 201. */
    @POST(ApiRoutes.WATCHLIST)
    suspend fun add(@Body body: AddWatchlistRequest): SuccessResponse

    /** Soft delete; idempotent. */
    @DELETE(ApiRoutes.WATCHLIST_TITLE)
    suspend fun remove(@Path("titleId") titleId: String): SuccessResponse
}
