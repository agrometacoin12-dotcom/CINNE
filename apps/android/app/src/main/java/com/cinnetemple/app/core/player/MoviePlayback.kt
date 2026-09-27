package com.cinnetemple.app.core.player

import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer

/**
 * Audio behaviour for long-form video (films, episodes, trailers).
 *
 * - Movie audio attributes + `handleAudioFocus`: starting playback asks other
 *   apps (music, podcasts) to pause, a phone call pauses the film, and focus
 *   is given back when the viewer pauses or leaves so their audio can resume.
 * - `handleAudioBecomingNoisy`: unplugging headphones / dropping Bluetooth
 *   pauses instead of blasting the film through the speaker.
 */
fun ExoPlayer.Builder.forMoviePlayback(): ExoPlayer.Builder =
    setAudioAttributes(
        AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build(),
        /* handleAudioFocus = */ true,
    ).setHandleAudioBecomingNoisy(true)
