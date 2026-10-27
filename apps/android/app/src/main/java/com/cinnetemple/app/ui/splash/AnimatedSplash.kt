package com.cinnetemple.app.ui.splash

import android.annotation.SuppressLint
import android.provider.Settings
import android.view.LayoutInflater
import androidx.annotation.OptIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.media3.ui.PlayerView
import com.cinnetemple.app.R
import kotlinx.coroutines.delay

private val Backdrop = Color(0xFF090B12)

/**
 * Branded logo reveal (res/raw/splash.mp4 — light streaks, then a cinematic
 * whoosh landing as the logo locks in), played once per cold start over the app.
 *
 * Audio uses sonification attributes WITHOUT taking audio focus: it follows the
 * ringer/system volume (silent phone = silent splash) and never pauses the
 * viewer's music. Tap to skip; with animations disabled it's skipped entirely.
 */
// Compose supplies the size; there is no ViewGroup parent during inflation.
@SuppressLint("InflateParams")
@OptIn(UnstableApi::class)
@Composable
fun AnimatedSplash(maxDurationMillis: Long = 6_000, fitVideo: Boolean = false, onFinished: () -> Unit) {
    val context = LocalContext.current
    val currentOnFinished by rememberUpdatedState(onFinished)
    val animationsOff = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    if (animationsOff) {
        LaunchedEffect(Unit) { onFinished() }
        return
    }

    val player = remember {
        ExoPlayer.Builder(context)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(C.AUDIO_CONTENT_TYPE_SONIFICATION)
                    .build(),
                /* handleAudioFocus = */ false,
            )
            .build()
            .apply {
                setMediaItem(MediaItem.fromUri("android.resource://${context.packageName}/${R.raw.splash}"))
                prepare()
                playWhenReady = true
            }
    }
    var finished by remember { mutableStateOf(false) }
    val finish = {
        if (!finished) {
            finished = true
            player.pause()
            currentOnFinished()
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { finish() }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) finish()
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                finish()
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    // The clip opens a shade more violet than the window background; a short
    // fade-in hides that step.
    var shown by remember { mutableStateOf(false) }
    val fadeAlpha by animateFloatAsState(if (shown) 1f else 0f, tween(300), label = "splashFade")
    LaunchedEffect(Unit) { shown = true }

    // Safety net: never hold the app hostage if playback stalls.
    LaunchedEffect(Unit) {
        delay(maxDurationMillis)
        finish()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Backdrop)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                finish()
            },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = fadeAlpha },
            factory = { ctx ->
                (LayoutInflater.from(ctx).inflate(R.layout.splash_player_view, null) as PlayerView).apply {
                    this.player = player
                    if (fitVideo) resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setBackgroundColor(0xFF090B12.toInt())
                }
            },
        )
    }
}
