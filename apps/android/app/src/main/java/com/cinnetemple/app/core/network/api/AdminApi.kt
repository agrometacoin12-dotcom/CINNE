package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.AdminPurchasesResponse
import com.cinnetemple.app.core.network.dto.AdminStats
import com.cinnetemple.app.core.network.dto.AdminTitle
import com.cinnetemple.app.core.network.dto.AdminUser
import com.cinnetemple.app.core.network.dto.AdminUsersResponse
import com.cinnetemple.app.core.network.dto.AuditResponse
import com.cinnetemple.app.core.network.dto.CreateMovieRequest
import com.cinnetemple.app.core.network.dto.DeleteMovieResponse
import com.cinnetemple.app.core.network.dto.FeaturedRequest
import com.cinnetemple.app.core.network.dto.PremiereScheduleRequest
import com.cinnetemple.app.core.network.dto.PresignRequest
import com.cinnetemple.app.core.network.dto.PresignResponse
import com.cinnetemple.app.core.network.dto.UpdateMovieRequest
import com.cinnetemple.app.core.network.dto.UpdateRolesRequest
import com.cinnetemple.app.core.network.dto.UpdateUserStatusRequest
import com.cinnetemple.app.core.network.dto.UploadResult
import com.cinnetemple.app.core.network.dto.UploadStatResponse
import kotlinx.serialization.json.JsonObject
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url

/** Every admin route returns 403 "Admin access required" for non-admins. */
interface AdminApi {
    @GET(ApiRoutes.ADMIN_MOVIES)
    suspend fun movies(): List<AdminTitle>

    @GET(ApiRoutes.ADMIN_MOVIE)
    suspend fun movie(@Path("id") id: String): AdminTitle

    @POST(ApiRoutes.ADMIN_MOVIES)
    suspend fun createMovie(@Body body: CreateMovieRequest): AdminTitle

    /** Omitted = unchanged. For explicit-null CLEARS use [updateMovieRaw]. */
    @PATCH(ApiRoutes.ADMIN_MOVIE)
    suspend fun updateMovie(@Path("id") id: String, @Body body: UpdateMovieRequest): AdminTitle

    /** Escape hatch for clear-semantics: build a JsonObject with JsonNull values. */
    @PATCH(ApiRoutes.ADMIN_MOVIE)
    suspend fun updateMovieRaw(@Path("id") id: String, @Body body: JsonObject): AdminTitle

    /** Permanent; allowed even with sold tickets (count returned). */
    @DELETE(ApiRoutes.ADMIN_MOVIE)
    suspend fun deleteMovie(@Path("id") id: String): DeleteMovieResponse

    /** featured:true atomically un-features every other title. */
    @PUT(ApiRoutes.ADMIN_MOVIE_FEATURED)
    suspend fun setFeatured(@Path("id") id: String, @Body body: FeaturedRequest): AdminTitle

    /** 400 if isPremiere true without premiereStartAt. */
    @PUT(ApiRoutes.ADMIN_MOVIE_PREMIERE)
    suspend fun setPremiere(@Path("id") id: String, @Body body: PremiereScheduleRequest): AdminTitle

    // --- Upload pipeline ---

    @POST(ApiRoutes.ADMIN_UPLOADS_PRESIGN)
    suspend fun presignUpload(@Body body: PresignRequest): PresignResponse

    /**
     * Streams the raw file bytes to the presigned URL. Build the RequestBody with
     * EXACTLY the returned Content-Type (it is inside the HMAC — mismatch = 401).
     * Single PUT, no chunking/multipart. Caps: video 8 GB, poster/hero 20 MB.
     */
    @PUT
    suspend fun uploadMedia(@Url uploadUrl: String, @Body body: RequestBody): UploadResult

    /** Verify size after upload, before attaching the key to a movie. */
    @GET(ApiRoutes.ADMIN_UPLOADS_STAT)
    suspend fun uploadStat(@Query("key") key: String): UploadStatResponse

    // --- Users ---

    @GET(ApiRoutes.ADMIN_USERS)
    suspend fun users(
        @Query("q") query: String? = null,
        @Query("take") take: Int? = null,
        @Query("skip") skip: Int? = null,
    ): AdminUsersResponse

    /** Full replace; 403 on self-demotion of own admin role. */
    @PUT(ApiRoutes.ADMIN_USER_ROLES)
    suspend fun setUserRoles(@Path("id") id: String, @Body body: UpdateRolesRequest): AdminUser

    /** Suspension kills login, Google sign-in AND refresh rotation. */
    @PUT(ApiRoutes.ADMIN_USER_STATUS)
    suspend fun setUserStatus(@Path("id") id: String, @Body body: UpdateUserStatusRequest): AdminUser

    @POST(ApiRoutes.ADMIN_USER_VERIFY)
    suspend fun verifyUser(@Path("id") id: String): AdminUser

    // --- Sales / audit / dashboard ---

    @GET(ApiRoutes.ADMIN_PURCHASES)
    suspend fun purchases(
        @Query("q") query: String? = null,
        @Query("titleId") titleId: String? = null,
        @Query("status") status: String? = null,
        @Query("take") take: Int? = null,
        @Query("skip") skip: Int? = null,
    ): AdminPurchasesResponse

    @GET(ApiRoutes.ADMIN_AUDIT)
    suspend fun audit(
        @Query("take") take: Int? = null,
        @Query("skip") skip: Int? = null,
    ): AuditResponse

    @GET(ApiRoutes.ADMIN_STATS)
    suspend fun stats(): AdminStats
}
