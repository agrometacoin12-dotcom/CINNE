package com.cinnetemple.app.core.network.api

import com.cinnetemple.app.core.network.ApiRoutes
import com.cinnetemple.app.core.network.dto.CurrentUser
import com.cinnetemple.app.core.network.dto.ProfileResponse
import com.cinnetemple.app.core.network.dto.RegisterDeviceRequest
import com.cinnetemple.app.core.network.dto.SuccessResponse
import com.cinnetemple.app.core.network.dto.UpdateProfileRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface UserApi {
    /** Omitted fields stay unchanged; version increments each save. */
    @PATCH(ApiRoutes.PROFILE)
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ProfileResponse

    /** 403 unless self or admin. */
    @GET(ApiRoutes.USER)
    suspend fun user(@Path("id") id: String): CurrentUser

    /**
     * Push registration. NOTE: backend enum only accepts IOS|WEB today —
     * "ANDROID" is a 400 until the backend adds it.
     */
    @POST(ApiRoutes.NOTIFICATION_DEVICES)
    suspend fun registerDevice(@Body body: RegisterDeviceRequest): SuccessResponse

    @DELETE(ApiRoutes.NOTIFICATION_DEVICE)
    suspend fun unregisterDevice(@Path("token") token: String): SuccessResponse
}
