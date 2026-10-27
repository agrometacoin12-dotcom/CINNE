package com.cinnetemple.app.core.network

import com.cinnetemple.app.core.network.dto.PlaybackSession
import com.cinnetemple.app.core.player.loadPlaybackStartup
import java.io.IOException
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PlaybackStartupTest {
    @Test fun newServersNeedOnlyAuthorizationAndPreserveTheResumePoint() = runTest {
        val result = loadPlaybackStartup(
            authorize = { delay(300); PlaybackSession(titleId = "film", resumeSeconds = 120) },
            resume = { fail("Must not load the entire history rail"); 0 },
        )
        assertEquals(300L, currentTime)
        assertEquals(120, result.resumeSeconds)
    }

    @Test fun zeroFromNewServerOverridesOldHistory() = runTest {
        val result = loadPlaybackStartup(
            authorize = { PlaybackSession(resumeSeconds = 0) },
            resume = { fail("A fresh ticket starts at zero"); 120 },
        )
        assertEquals(0, result.resumeSeconds)
    }

    @Test fun oldServersCanStillResumeFromHistory() = runTest {
        assertEquals(120, loadPlaybackStartup({ PlaybackSession() }, { 120 }).resumeSeconds)
    }

    @Test fun unavailableLegacyHistoryDoesNotBlockAuthorizedPlayback() = runTest {
        assertEquals(0, loadPlaybackStartup({ PlaybackSession() }, { throw IOException("offline") }).resumeSeconds)
    }

    @Test fun deniedAuthorizationNeverLoadsHistory() = runTest {
        try {
            loadPlaybackStartup({ throw IOException("denied") }, { fail("Unauthorized"); 0 })
            fail("Must not create a player without authorization")
        } catch (error: IOException) { assertEquals("denied", error.message) }
    }

    @Test fun leavingTheScreenCancelsAuthorization() = runTest {
        var cancelled = false
        val pending = launch {
            loadPlaybackStartup(
                { try { awaitCancellation() } finally { cancelled = true } },
                { fail("Cancelled"); 0 },
            )
        }
        runCurrent()
        pending.cancelAndJoin()
        assertTrue(cancelled)
    }
}
