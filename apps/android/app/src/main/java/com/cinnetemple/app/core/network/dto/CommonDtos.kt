package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class SuccessResponse(val success: Boolean = true)

@Serializable
data class MessageResponse(val message: String = "")

/** GET /v1/health (Terminus shape; only `status` matters to the client). */
@Serializable
data class HealthResponse(val status: String = "")
