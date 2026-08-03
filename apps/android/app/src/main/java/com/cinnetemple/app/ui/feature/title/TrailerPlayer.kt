package com.cinnetemple.app.ui.feature.title

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.view.View
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.cinnetemple.app.core.security.findActivity
import com.cinnetemple.app.ui.components.liquidGlass

/**
 * Outlined secondary CTA — "Watch trailer". Deliberately distinct from the
 * indigo PrimaryButton (paid Watch/Buy): a translucent glass-bordered pill so
 * the marketing trailer never competes with the purchase action. Only shown
 * when the title advertises a trailer (TitleDetail.hasTrailer).
 */
@Composable
internal fun WatchTrailerButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .border(1.dp, Color.White.copy(alpha = 0.25f), shape)
            .clickable(enabled = !loading, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Filled.PlayCircle,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    "Watch trailer",
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/**
 * PLAIN full-screen trailer player. Marketing content — public, NOT watermarked,
 * NOT watch-once, NO entitlement, NO progress heartbeats, NO FLAG_SECURE. This
 * is intentionally the antithesis of [com.cinnetemple.app.ui.feature.watch.SecurePlayer]:
 * it just plays a signed trailer URL with Media3's built-in transport controls.
 *
 * The paid movie/series playback paths are untouched — nothing here opens a
 * viewing window, reports progress, or consumes any ticket.
 *
 * @param url a short-lived signed stream URL from GET /v1/catalogue/titles/{id}/trailer.
 */
@OptIn(UnstableApi::class)
@Composable
internal fun TrailerPlayerDialog(
    url: String,
    onDismiss: () -> Unit,
) {
    val view = LocalView.current
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    var playerError by remember { mutableStateOf(false) }
    var isPlaying by remember { mutableStateOf(false) }
    // Chrome (close + fullscreen) tracks the auto-hiding Media3 controller so it
    // fades out together with the transport ~3.5s after the last interaction.
    var chromeVisible by remember { mutableStateOf(true) }

    val player = remember {
        ExoPlayer.Builder(view.context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
                if (playing) playerError = false
            }

            override fun onPlayerError(error: PlaybackException) {
                playerError = true
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    // Keep the screen awake while the trailer is playing.
    DisposableEffect(isPlaying) {
        view.keepScreenOn = isPlaying
        onDispose { view.keepScreenOn = false }
    }

    // Auto-restore to portrait when the trailer is dismissed (matches the film
    // player). Landscape is only ever enabled by the fullscreen toggle below.
    DisposableEffect(Unit) {
        onDispose { activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnClickOutside = false,
        ),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        // Media3's built-in controls = plain playback (play/pause/scrub),
                        // but auto-hiding: a single tap toggles them and they fade out
                        // 3.5s after the last interaction while playing.
                        useController = true
                        controllerAutoShow = true
                        controllerHideOnTouch = true
                        controllerShowTimeoutMs = 3500
                        // Fade the Compose close/fullscreen chrome together with the
                        // native controller so nothing stays persistently on screen.
                        setControllerVisibilityListener(
                            PlayerView.ControllerVisibilityListener { visibility ->
                                chromeVisible = visibility == View.VISIBLE
                            },
                        )
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                        this.player = player
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )

            if (playerError) {
                Text(
                    "Trailer playback failed. Check your connection and try again.",
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 32.dp),
                )
            }

            // Close + fullscreen chrome — hides in step with the auto-hiding controls.
            if (chromeVisible) {
                // Glass back/close circle, mirroring the player chrome elsewhere.
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                        .size(40.dp)
                        .liquidGlass(radius = 20.dp)
                        .clickable(onClick = onDismiss),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBackIos,
                        contentDescription = "Close trailer",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }

                // Fullscreen -> landscape toggle (top-right), matching the film player.
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                        .size(40.dp)
                        .liquidGlass(radius = 20.dp)
                        .clickable {
                            activity?.requestedOrientation = if (isLandscape) {
                                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                            } else {
                                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                            }
                        },
                ) {
                    Icon(
                        if (isLandscape) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                        contentDescription = if (isLandscape) "Exit fullscreen" else "Fullscreen",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}
