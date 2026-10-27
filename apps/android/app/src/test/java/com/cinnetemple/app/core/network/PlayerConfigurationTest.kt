package com.cinnetemple.app.core.network

import android.app.Application
import android.view.LayoutInflater
import android.view.TextureView
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.cinnetemple.app.R
import com.cinnetemple.app.core.player.forMoviePlayback
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class PlayerConfigurationTest {
    @Test fun signedPlaylistUrlsUseTheHlsMediaSource() {
        val source = androidx.media3.exoplayer.source.DefaultMediaSourceFactory(RuntimeEnvironment.getApplication())
            .createMediaSource(androidx.media3.common.MediaItem.fromUri("https://fixture.test/v1/media/hls/asset/build/master.m3u8?sig=test"))
        assertTrue(source is androidx.media3.exoplayer.hls.HlsMediaSource)
    }

    @Test fun splashUsesATextureSurfaceForOpacityOnOlderAndroid() {
        val view = LayoutInflater.from(RuntimeEnvironment.getApplication())
            .inflate(R.layout.splash_player_view, null) as PlayerView
        assertTrue(view.videoSurfaceView is TextureView)
        assertFalse(view.useController)
    }

    @Test fun movieAndTrailerUseMediaMovieAudioAttributes() {
        val player = ExoPlayer.Builder(RuntimeEnvironment.getApplication()).forMoviePlayback().build()
        try {
            assertEquals(C.USAGE_MEDIA, player.audioAttributes.usage)
            assertEquals(C.AUDIO_CONTENT_TYPE_MOVIE, player.audioAttributes.contentType)
        } finally { player.release() }
    }
}
