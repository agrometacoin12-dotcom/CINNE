package com.cinnetemple.app.core.player

import com.cinnetemple.app.core.network.dto.PlaybackSession
import kotlinx.coroutines.CancellationException

internal data class PlaybackStartup(val session: PlaybackSession, val resumeSeconds: Int)

/** New servers return resume position with authorization; old servers use history. */
internal suspend fun loadPlaybackStartup(
    authorize: suspend () -> PlaybackSession,
    resume: suspend () -> Int,
): PlaybackStartup {
    val session = authorize()
    val position = session.resumeSeconds ?: try {
        resume()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        0
    }
    return PlaybackStartup(session, position.coerceAtLeast(0))
}
