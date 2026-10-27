package com.cinnetemple.app.core.player

import android.net.ConnectivityManager
import androidx.annotation.OptIn
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.cinnetemple.app.core.di.LocalAppContainer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay

/** Warm one server-bounded segment only on unmetered, foreground detail pages. */
@OptIn(UnstableApi::class)
@Composable
fun PreparePlaybackEffect(titleId: String, enabled: Boolean) {
    val context = LocalContext.current
    val container = LocalAppContainer.current
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    LaunchedEffect(titleId, enabled, lifecycle) {
        if (!enabled || lifecycle != Lifecycle.State.RESUMED) return@LaunchedEffect
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        if (connectivity.isActiveNetworkMetered) return@LaunchedEffect
        var player: ExoPlayer? = null
        try {
            delay(350) // Don't fetch video while rapidly browsing titles.
            val url = container.playbackApi.prepare(titleId).url ?: return@LaunchedEffect
            player = ExoPlayer.Builder(context)
                .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(container.mediaHttpClient)))
                .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(1000, 5000, 500, 1000).build())
                .build().apply {
                    volume = 0f
                    playWhenReady = false
                    setMediaItem(MediaItem.fromUri(url))
                    prepare()
                }
            awaitCancellation()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Old server, no rendition, or offline: preparation is optional.
        } finally { player?.release() }
    }
}
