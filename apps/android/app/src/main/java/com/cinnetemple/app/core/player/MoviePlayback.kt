package com.cinnetemple.app.core.player

import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer

/** Own media audio focus while playing, and pause when headphones disconnect. */
fun ExoPlayer.Builder.forMoviePlayback(): ExoPlayer.Builder =
    setAudioAttributes(
        AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build(),
        /* handleAudioFocus = */ true,
    ).setHandleAudioBecomingNoisy(true)
