package com.cinnetemple.app.ui.feature.premieres

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.cinnetemple.app.core.di.LocalAppContainer
import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.dto.ChatMessage
import com.cinnetemple.app.core.network.dto.PremiereRoom
import com.cinnetemple.app.core.network.dto.SendChatRequest
import com.cinnetemple.app.navigation.Routes
import com.cinnetemple.app.ui.components.CinematicBackground
import com.cinnetemple.app.ui.components.ErrorBanner
import com.cinnetemple.app.ui.components.GlassButton
import com.cinnetemple.app.ui.components.IndigoGlassButton
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val MAX_CHAT_MESSAGES = 300
private const val MAX_CHAT_BODY = 500

/**
 * Premiere room — GET /v1/premieres/{id}/room drives the stage:
 *  - no entitlement -> "Get ticket" CTA (title detail owns the purchase flow),
 *  - entitled but not live -> monospaced countdown to premiereStartAt,
 *  - live + entitled -> "Enter cinema" into watch/{id}.
 * Chat: GET /v1/premieres/{id}/chat polled every 3s while entitled (reads are
 * open pre-show for ticket holders); composer only when room.canChat
 * (live AND entitled). No fabricated audience numbers anywhere.
 */
@Composable
fun PremiereRoomScreen(nav: NavController, titleId: String) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()

    var room by remember { mutableStateOf<PremiereRoom?>(null) }
    var roomError by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    val messages = remember { mutableStateListOf<ChatMessage>() }
    var chatBlocked by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val listState = rememberLazyListState()

    suspend fun loadRoom() {
        try {
            room = container.premieresApi.room(titleId)
            roomError = null
        } catch (e: ApiException) {
            if (room == null) roomError = e.userMessage
        } catch (_: Exception) {
            if (room == null) roomError = "Couldn't load the premiere room."
        }
        loading = false
    }

    // Room state refresh — every 15s so the LIVE flip happens without a re-open.
    LaunchedEffect(titleId) {
        loadRoom()
        while (isActive) {
            delay(15_000)
            loadRoom()
        }
    }

    // 1s countdown ticker.
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(1_000)
            now = System.currentTimeMillis()
        }
    }

    // Chat poll — every 3s with since=<last createdAt>, ticket holders only.
    LaunchedEffect(room?.entitled) {
        if (room?.entitled != true) return@LaunchedEffect
        chatBlocked = false
        while (isActive && !chatBlocked) {
            try {
                val since = messages.lastOrNull()?.createdAt
                val fresh = container.premieresApi.chat(titleId, since)
                if (fresh.isNotEmpty()) {
                    val known = messages.mapTo(HashSet()) { it.id }
                    messages.addAll(fresh.filter { it.id !in known })
                    while (messages.size > MAX_CHAT_MESSAGES) messages.removeAt(0)
                }
            } catch (e: ApiException) {
                if (e.isForbidden) chatBlocked = true
            } catch (_: Exception) {
                // transient network error — keep polling
            }
            delay(3_000)
        }
    }

    // Auto-scroll to the newest message.
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    fun sendMessage() {
        val body = draft.trim().take(MAX_CHAT_BODY)
        if (body.isEmpty() || sending) return
        scope.launch {
            sending = true
            sendError = null
            try {
                val created = container.premieresApi.sendChat(titleId, SendChatRequest(body))
                if (messages.none { it.id == created.id }) {
                    messages.add(created)
                    while (messages.size > MAX_CHAT_MESSAGES) messages.removeAt(0)
                }
                draft = ""
            } catch (e: ApiException) {
                sendError = e.userMessage
            } catch (_: Exception) {
                sendError = "Message failed to send."
            }
            sending = false
        }
    }

    Box(Modifier.fillMaxSize()) {
        CinematicBackground(Modifier.matchParentSize())
        when {
            loading && room == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }

            room == null -> RoomErrorState(
                message = roomError ?: "Couldn't load the premiere room.",
                onBack = { nav.popBackStack() },
                onRetry = {
                    loading = true
                    roomError = null
                    scope.launch { loadRoom() }
                },
            )

            else -> RoomContent(
                nav = nav,
                titleId = titleId,
                room = room!!,
                now = now,
                messages = messages,
                listState = listState,
                draft = draft,
                onDraftChange = { draft = it.take(MAX_CHAT_BODY) },
                sending = sending,
                sendError = sendError,
                onSend = ::sendMessage,
            )
        }
    }
}

@Composable
private fun RoomContent(
    nav: NavController,
    titleId: String,
    room: PremiereRoom,
    now: Long,
    messages: List<ChatMessage>,
    listState: androidx.compose.foundation.lazy.LazyListState,
    draft: String,
    onDraftChange: (String) -> Unit,
    sending: Boolean,
    sendError: String?,
    onSend: () -> Unit,
) {
    val startMillis = remember(room.premiereStartAt) { parseIsoMillis(room.premiereStartAt) }

    Column(Modifier.fillMaxSize()) {
        // Top bar — glass back circle + one-line title.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlassCircleButton(icon = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") {
                nav.popBackStack()
            }
            Spacer(Modifier.width(12.dp))
            Text(
                room.title,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // (1) Stage — 16:9 black rounded rect with badges + gate/countdown/enter.
        Box(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(16.dp))
                .background(Color.Black),
        ) {
            Row(
                Modifier.padding(10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (room.live) {
                    PremiereBadge("● LIVE", tint = LiveRed)
                } else {
                    PremiereBadge("STARTS SOON", tint = null)
                }
                PremiereBadge("PREMIERE", tint = null)
            }

            Column(
                Modifier.align(Alignment.Center).padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when {
                    !room.entitled -> {
                        Text(
                            "Get a ticket to watch and chat.",
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                        )
                        Box(Modifier.width(180.dp)) {
                            IndigoGlassButton("Get ticket") { nav.navigate(Routes.title(titleId)) }
                        }
                    }

                    room.live -> {
                        Box(Modifier.width(200.dp)) {
                            IndigoGlassButton("Enter cinema") { nav.navigate(Routes.watch(titleId)) }
                        }
                    }

                    else -> {
                        Text("Premiere starts in", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                        Text(
                            startMillis?.let { formatCountdown(it - now) } ?: "Showtime to be announced",
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                        )
                    }
                }
            }
        }

        // (2) Meta.
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(
                "${room.title} — World Premiere",
                color = Color.White,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            val status = when {
                room.live && room.canChat -> "Live now • Chat is live"
                room.live -> "Live now"
                else -> {
                    val when_ = startMillis?.let { "Starts ${formatShowtime(it)}" } ?: "Showtime to be announced"
                    if (room.entitled) "$when_ • Pre-show chat is open" else "$when_ • Ticket holders can chat"
                }
            }
            Text(status, color = Color.White.copy(alpha = 0.6f), fontSize = 11.5.sp)
        }

        HorizontalDivider(color = Color.White.copy(alpha = 0.10f), thickness = 1.dp)

        // (3) Pinned host message.
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .liquidGlass(radius = 10.dp, tint = CtColors.Brand, elevation = 4.dp)
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.PushPin,
                contentDescription = null,
                tint = CtColors.IndigoLight,
                modifier = Modifier.size(12.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                buildString { append("Cinnetemple  ") },
                color = Color.White,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Welcome to the premiere — keep it kind and enjoy the show.",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // (4) Chat.
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                !room.entitled -> Text(
                    "Chat is reserved for ticket holders.",
                    color = CtColors.TextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.align(Alignment.Center).padding(horizontal = 32.dp),
                    textAlign = TextAlign.Center,
                )

                messages.isEmpty() -> Text(
                    "No messages yet. Say hello!",
                    color = CtColors.TextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.align(Alignment.Center),
                )

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(messages, key = { it.id }) { message -> ChatRow(message) }
                }
            }
        }

        if (sendError != null) {
            ErrorBanner(sendError, Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }

        // (5) Composer — only when chat is open (live AND entitled).
        if (room.canChat) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                BasicTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                    cursorBrush = SolidColor(CtColors.Brand),
                    maxLines = 3,
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .liquidGlass(radius = 22.dp, elevation = 4.dp)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                        ) {
                            if (draft.isEmpty()) {
                                Text("Say something…", color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp)
                            }
                            inner()
                        }
                    },
                )
                val canSend = draft.isNotBlank() && !sending
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(if (canSend) CtColors.Brand else CtColors.Brand.copy(alpha = 0.4f))
                        .clickable(enabled = canSend) { onSend() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (sending) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        } else {
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ChatRow(message: ChatMessage) {
    Column {
        Text(message.author, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text(message.body, color = CtColors.TextSecondary, fontSize = 13.sp)
    }
}

@Composable
private fun RoomErrorState(message: String, onBack: () -> Unit, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(16.dp)) {
            GlassCircleButton(icon = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", onClick = onBack)
        }
        Column(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Premiere unavailable", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(message, color = CtColors.TextSecondary, fontSize = 13.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Box(Modifier.width(160.dp)) {
                GlassButton("Retry", onClick = onRetry)
            }
        }
    }
}

/** 40dp liquid-glass circle icon button (iOS back/heart/CC circles). */
@Composable
internal fun GlassCircleButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(40.dp)
            .liquidGlass(radius = 20.dp, elevation = 4.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}
