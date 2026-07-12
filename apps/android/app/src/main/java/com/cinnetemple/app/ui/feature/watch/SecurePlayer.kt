package com.cinnetemple.app.ui.feature.watch

import android.content.pm.ActivityInfo
import android.os.Build
import androidx.annotation.OptIn
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateOffsetAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.cinnetemple.app.R
import com.cinnetemple.app.core.network.dto.PlaybackSession
import com.cinnetemple.app.core.security.findActivity
import com.cinnetemple.app.ui.components.liquidGlass
import com.cinnetemple.app.ui.theme.CtColors
import java.util.Locale
import java.util.TimeZone
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The anti-piracy Media3 player — Android port of the iOS SecurePlayerView:
 * drifting per-viewer watermark, "CinneTemple · {watermark}" corner badge,
 * single-view countdown chip + lockout, 10s progress heartbeats, auto-pause on
 * background, KeepScreenOn while playing, and signed-URL refresh on error.
 * FLAG_SECURE is held by the parent WatchScreen.
 */
@OptIn(UnstableApi::class)
@Composable
internal fun SecurePlayer(
    session: PlaybackSession,
    resumePositionSeconds: Int,
    posterUrl: String?,
    isLandscape: Boolean,
    onBack: () -> Unit,
    refreshStreamUrl: suspend () -> String?,
    sendProgress: suspend (positionSeconds: Int, durationSeconds: Int) -> Unit,
    onFinalProgress: (positionSeconds: Int, durationSeconds: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()

    var isPlaying by remember { mutableStateOf(false) }
    var isBuffering by remember { mutableStateOf(true) }
    var renderedFirstFrame by remember { mutableStateOf(false) }
    var hasStartedPlaying by remember { mutableStateOf(false) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var refreshAttempts by remember { mutableIntStateOf(0) }
    var positionMs by remember { mutableLongStateOf(resumePositionSeconds * 1000L) }
    var durationMs by remember { mutableLongStateOf(session.durationSeconds * 1000L) }
    var locked by remember { mutableStateOf(false) }
    var remainingLabel by remember { mutableStateOf<String?>(null) }
    var controlsVisible by remember { mutableStateOf(true) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }

    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(session.url))
            prepare()
            // Resume from the continue-watching position — seek once, up front.
            if (resumePositionSeconds > 0) seekTo(resumePositionSeconds * 1000L)
            playWhenReady = true
        }
    }

    fun currentDurationSeconds(): Int {
        val d = player.duration
        return if (d > 0) (d / 1000L).toInt() else session.durationSeconds
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
                if (playing) {
                    hasStartedPlaying = true
                    playerError = null
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                isBuffering = playbackState == Player.STATE_BUFFERING
            }

            override fun onRenderedFirstFrame() {
                renderedFirstFrame = true
            }

            override fun onPlayerError(error: PlaybackException) {
                // The signed stream URL has a ~4h TTL; re-calling start within the
                // window returns the SAME session with a fresh url.
                if (refreshAttempts < 2) {
                    refreshAttempts++
                    val resumeMs = player.currentPosition.coerceAtLeast(0L)
                    scope.launch {
                        val fresh = refreshStreamUrl()
                        if (fresh != null) {
                            player.setMediaItem(MediaItem.fromUri(fresh))
                            player.prepare()
                            player.seekTo(resumeMs)
                            player.play()
                        } else {
                            playerError = "Playback failed — your viewing session may have ended."
                        }
                    }
                } else {
                    playerError = "Playback failed. Check your connection and try again."
                }
            }
        }
        player.addListener(listener)
        onDispose {
            val pos = (player.currentPosition / 1000L).toInt().coerceAtLeast(0)
            val dur = currentDurationSeconds()
            if (hasStartedPlaying) onFinalProgress(pos, dur)
            player.removeListener(listener)
            player.release()
        }
    }

    // Auto-pause when the app backgrounds (single-view policy).
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { player.pause() }

    // Keep the screen awake while playing.
    DisposableEffect(isPlaying) {
        view.keepScreenOn = isPlaying
        onDispose { view.keepScreenOn = false }
    }

    // Restore orientation when leaving the screen.
    val activity = remember(context) { context.findActivity() }
    DisposableEffect(Unit) {
        onDispose { activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }
    }

    // Position/duration poll for the scrub bar.
    LaunchedEffect(player) {
        while (isActive) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            val d = player.duration
            if (d > 0) durationMs = d
            delay(500)
        }
    }

    // Progress heartbeats: every 10s while playing + one on every pause.
    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (isActive) {
                delay(10_000)
                sendProgress((player.currentPosition / 1000L).toInt().coerceAtLeast(0), currentDurationSeconds())
            }
        } else if (hasStartedPlaying) {
            sendProgress((player.currentPosition / 1000L).toInt().coerceAtLeast(0), currentDurationSeconds())
        }
    }

    // Watch-once expiry countdown -> lockout.
    val expiryMs = remember(session.expiresAt) { parseIsoMillis(session.expiresAt) }
    LaunchedEffect(expiryMs) {
        if (expiryMs == null) return@LaunchedEffect
        while (isActive) {
            val left = expiryMs - System.currentTimeMillis()
            if (left <= 0L) {
                remainingLabel = null
                locked = true
                player.pause()
                break
            }
            remainingLabel = formatRemaining(left)
            delay(min(30_000L, left))
        }
    }

    // Drifting watermark — random reposition every 4s, eased over 1.2s.
    var watermarkTarget by remember { mutableStateOf(Offset.Zero) }
    val watermarkOffset by animateOffsetAsState(
        targetValue = watermarkTarget,
        animationSpec = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
        label = "watermark-drift",
    )
    LaunchedEffect(locked, containerSize) {
        if (locked || containerSize == IntSize.Zero) return@LaunchedEffect
        while (isActive) {
            delay(4_000)
            val maxX = containerSize.width / 3
            val maxY = containerSize.height / 3
            watermarkTarget = Offset(
                Random.nextInt(-maxX, maxX + 1).toFloat(),
                Random.nextInt(-maxY, maxY + 1).toFloat(),
            )
        }
    }

    // Auto-hide controls after 3.5s of playback.
    LaunchedEffect(controlsVisible, isPlaying) {
        if (controlsVisible && isPlaying) {
            delay(3_500)
            controlsVisible = false
        }
    }

    var scrubbing by remember { mutableStateOf(false) }
    var scrubPositionMs by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = modifier
            .background(Color.Black)
            .onSizeChanged { containerSize = it }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { if (!locked) controlsVisible = !controlsVisible },
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    this.player = player
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Poster while buffering, until the first frame renders.
        if (!renderedFirstFrame && !locked && posterUrl != null) {
            AsyncImage(
                model = posterUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().alpha(0.6f),
            )
        }

        if (isBuffering && !locked) {
            CircularProgressIndicator(
                color = Color.White,
                modifier = Modifier.size(40.dp).align(Alignment.Center),
            )
        }

        // Drifting per-viewer watermark: small logo + session.watermark at ~30% alpha.
        if (!locked) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(3.dp),
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset { IntOffset(watermarkOffset.x.roundToInt(), watermarkOffset.y.roundToInt()) },
            ) {
                Image(
                    painter = painterResource(R.drawable.c_logo),
                    contentDescription = null,
                    alpha = 0.25f,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    session.watermark,
                    color = Color.White.copy(alpha = 0.35f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    style = TextStyle(
                        shadow = Shadow(color = Color.Black.copy(alpha = 0.6f), blurRadius = 4f),
                    ),
                )
            }
        }

        // Corner badge: "CinneTemple · {watermark}", always burned in.
        if (!locked) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp),
            ) {
                Image(
                    painter = painterResource(R.drawable.c_logo),
                    contentDescription = null,
                    alpha = 0.3f,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    "CinneTemple · ${session.watermark}",
                    color = Color.White.copy(alpha = 0.3f),
                    fontSize = 9.sp,
                )
            }
        }

        // Top bar: glass back, centered title, glass CC chip + countdown chip.
        if (controlsVisible && !locked) {
            Column(Modifier.align(Alignment.TopCenter).fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .padding(top = if (isLandscape) 12.dp else 8.dp),
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(40.dp)
                            .liquidGlass(radius = 20.dp)
                            .clickable(onClick = onBack),
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBackIos,
                            contentDescription = "Back",
                            tint = Color.White,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Text(
                        session.title,
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                    )
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(40.dp).liquidGlass(radius = 20.dp),
                    ) {
                        Text("CC", color = Color.White, fontSize = 12.sp)
                    }
                }
                remainingLabel?.let { label ->
                    Text(
                        label,
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 11.sp,
                        modifier = Modifier
                            .padding(start = 16.dp, top = 8.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.5f))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }
            }
        }

        // Center transport: -15s / play-pause / +15s.
        if (controlsVisible && !locked) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(28.dp),
                modifier = Modifier.align(Alignment.Center),
            ) {
                TransportButton(Icons.Filled.FastRewind, "Back 15 seconds", 44.dp, 22.dp) {
                    player.seekTo((player.currentPosition - 15_000L).coerceAtLeast(0L))
                    controlsVisible = true
                }
                TransportButton(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    if (isPlaying) "Pause" else "Play",
                    64.dp,
                    34.dp,
                ) {
                    if (isPlaying) player.pause() else player.play()
                }
                TransportButton(Icons.Filled.FastForward, "Forward 15 seconds", 44.dp, 22.dp) {
                    val target = player.currentPosition + 15_000L
                    player.seekTo(if (durationMs > 0) target.coerceAtMost(durationMs) else target)
                    controlsVisible = true
                }
            }
        }

        // Bottom scrub bar with timecodes + fullscreen toggle.
        if (controlsVisible && !locked) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.35f))
                    .padding(horizontal = 12.dp, vertical = 2.dp),
            ) {
                val shownMs = if (scrubbing) scrubPositionMs.toLong() else positionMs
                Text(formatTimecode(shownMs), color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
                Slider(
                    value = if (scrubbing) scrubPositionMs else positionMs.toFloat(),
                    onValueChange = {
                        scrubbing = true
                        scrubPositionMs = it
                    },
                    onValueChangeFinished = {
                        player.seekTo(scrubPositionMs.toLong())
                        scrubbing = false
                    },
                    valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = Color.White,
                        activeTrackColor = CtColors.IndigoLight,
                        inactiveTrackColor = Color.White.copy(alpha = 0.2f),
                    ),
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp).height(28.dp),
                )
                Text(formatTimecode(durationMs), color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
                Spacer(Modifier.width(8.dp))
                Icon(
                    if (isLandscape) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                    contentDescription = if (isLandscape) "Exit fullscreen" else "Fullscreen",
                    tint = Color.White,
                    modifier = Modifier
                        .size(24.dp)
                        .clickable {
                            activity?.requestedOrientation = if (isLandscape) {
                                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                            } else {
                                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                            }
                        },
                )
            }
        }

        playerError?.let { message ->
            if (!locked) {
                Text(
                    message,
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 44.dp, start = 24.dp, end = 24.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.6f))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }

        // Watch-once lockout: the viewing window has elapsed.
        if (locked) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .padding(horizontal = 30.dp),
            ) {
                Spacer(Modifier.weight(1f))
                Icon(
                    Icons.Filled.HourglassEmpty,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(40.dp),
                )
                Text(
                    "Your viewing window has ended",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "This was a single-view ticket. Purchase again to rewatch.",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TransportButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    size: androidx.compose.ui.unit.Dp,
    iconSize: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClick = onClick),
    ) {
        Icon(icon, contentDescription = contentDescription, tint = Color.White, modifier = Modifier.size(iconSize))
    }
}

/** "1:23:45" / "12:05" player timecodes. */
internal fun formatTimecode(ms: Long): String {
    val total = (ms.coerceAtLeast(0L) / 1000L).toInt()
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) {
        String.format(Locale.US, "%d:%02d:%02d", h, m, s)
    } else {
        String.format(Locale.US, "%d:%02d", m, s)
    }
}

/** "3h 12m left" / "42m left" countdown chip label. */
internal fun formatRemaining(leftMs: Long): String {
    val totalMinutes = (leftMs / 60_000L).toInt()
    val h = totalMinutes / 60
    val m = totalMinutes % 60
    return if (h > 0) "${h}h ${m}m left" else "${m}m left"
}

/**
 * ISO-8601 -> epoch millis without java.time on minSdk 24 (no core-library
 * desugaring is configured). Handles offsets and fractional seconds on API 26+;
 * pre-26 falls back to a UTC SimpleDateFormat on the trimmed timestamp.
 */
internal fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    if (Build.VERSION.SDK_INT >= 26) {
        runCatching {
            return java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
        }
        runCatching { return java.time.Instant.parse(iso).toEpochMilli() }
        return null
    }
    return runCatching {
        val trimmed = iso.substringBefore('.').removeSuffix("Z").substringBefore('+')
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        fmt.parse(trimmed)?.time
    }.getOrNull()
}
