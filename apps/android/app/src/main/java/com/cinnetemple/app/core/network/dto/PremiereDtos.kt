package com.cinnetemple.app.core.network.dto

import kotlinx.serialization.Serializable

/** GET /v1/premieres/{titleId}/room — canChat = live AND entitled. */
@Serializable
data class PremiereRoom(
    val titleId: String = "",
    val title: String = "",
    val live: Boolean = false,
    val premiereStartAt: String? = null,
    val canChat: Boolean = false,
    val entitled: Boolean = false,
)

/** GET/POST /v1/premieres/{titleId}/chat item — poll with ?since=<last createdAt>. */
@Serializable
data class ChatMessage(
    val id: String = "",
    val author: String = "",
    val body: String = "",
    val userId: String = "",
    val createdAt: String = "",
)

/** POST /v1/premieres/{titleId}/chat — body 1..500 chars (trimmed, hard-capped). */
@Serializable
data class SendChatRequest(val body: String)
