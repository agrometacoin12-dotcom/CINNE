package com.cinnetemple.app.core.network

import java.io.IOException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Decoded RFC 7807 problem+json error from the backend:
 * `{type:'about:blank', title, status, detail, instance, correlationId}`.
 * `detail` may be a string[] for 400 validation failures — [detailList] keeps
 * the individual entries, [detail] joins them for display.
 *
 * Extends [IOException] so it can be thrown from an OkHttp interceptor and
 * propagate out of Retrofit suspend calls: EVERY non-2xx API response surfaces
 * to feature code as an ApiException.
 */
class ApiException(
    val status: Int,
    val title: String,
    val detail: String? = null,
    val detailList: List<String> = emptyList(),
    val correlationId: String? = null,
) : IOException("HTTP $status $title" + (detail?.let { ": $it" } ?: "")) {

    /** Human-friendly one-liner for banners. */
    val userMessage: String get() = detail ?: title

    val isUnauthorized: Boolean get() = status == 401
    val isForbidden: Boolean get() = status == 403
    val isNotFound: Boolean get() = status == 404
    val isRateLimited: Boolean get() = status == 429

    companion object {
        /** Parses a problem+json (or arbitrary) error body into an [ApiException]. */
        fun parse(json: Json, status: Int, body: String?): ApiException {
            if (body.isNullOrBlank()) return ApiException(status, defaultTitle(status))
            return try {
                val obj = json.parseToJsonElement(body).jsonObject
                val title = obj["title"]?.jsonPrimitive?.contentOrNull
                    ?: obj["message"]?.jsonPrimitive?.contentOrNull
                    ?: defaultTitle(status)
                val detailList = when (val detail = obj["detail"]) {
                    is JsonArray -> detail.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                    is JsonPrimitive -> listOfNotNull(detail.contentOrNull)
                    else -> emptyList()
                }
                ApiException(
                    status = (obj["status"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: status,
                    title = title,
                    detail = detailList.joinToString("\n").ifBlank { null },
                    detailList = detailList,
                    correlationId = obj["correlationId"]?.jsonPrimitive?.contentOrNull,
                )
            } catch (_: Exception) {
                ApiException(status, defaultTitle(status), body.take(300))
            }
        }

        private fun defaultTitle(status: Int): String = when (status) {
            400 -> "Bad Request"
            401 -> "Unauthorized"
            403 -> "Forbidden"
            404 -> "Not Found"
            409 -> "Conflict"
            413 -> "Payload Too Large"
            429 -> "Too Many Requests"
            in 500..599 -> "Server Error"
            else -> "Request failed ($status)"
        }
    }
}
