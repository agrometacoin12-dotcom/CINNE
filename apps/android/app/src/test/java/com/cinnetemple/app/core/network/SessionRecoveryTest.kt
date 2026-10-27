package com.cinnetemple.app.core.network

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.cinnetemple.app.core.auth.SessionPhase
import com.cinnetemple.app.core.auth.SessionStore
import com.cinnetemple.app.core.auth.TokenStore
import com.cinnetemple.app.core.network.api.AuthApi
import com.cinnetemple.app.core.network.dto.TokenPair
import java.io.File
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.*
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = android.app.Application::class)
class SessionRecoveryTest {
    @get:Rule val temporary = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var tokens: TokenStore
    private lateinit var session: SessionStore
    private lateinit var client: OkHttpClient
    private lateinit var jobs: Job
    private val json = Json { ignoreUnknownKeys = true }
    private val user = """{"id":"viewer","email":"viewer@example.test","status":"ACTIVE"}"""
    private val pair = """{"accessToken":"new-access","refreshToken":"new-refresh"}"""

    @Before fun setUp() = runBlocking {
        jobs = SupervisorJob()
        val scope = CoroutineScope(jobs + Dispatchers.Unconfined)
        tokens = TokenStore(PreferenceDataStoreFactory.create(scope = CoroutineScope(jobs + Dispatchers.IO)) {
            File(temporary.root, "session.preferences_pb")
        })
        tokens.setTokens(TokenPair("old-access", "old-refresh"))
        server = MockWebServer().also { it.start() }
        val invalidator = SessionInvalidator()
        client = OkHttpClient.Builder()
            .authenticator(TokenAuthenticator(server.url("/").toString(), tokens, json, invalidator))
            .addInterceptor(AuthInterceptor(tokens))
            .addInterceptor(ProblemJsonInterceptor(json))
            .build()
        val api = Retrofit.Builder().baseUrl(server.url("/"))
            .client(client).addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(AuthApi::class.java)
        session = SessionStore(tokens, api, scope)
        invalidator.onInvalidated = session::forceUnauthenticated
    }

    @After fun tearDown() = runBlocking {
        jobs.cancelAndJoin()
        client.dispatcher.executorService.shutdownNow()
        client.connectionPool.evictAll()
        server.shutdown()
    }

    private fun response(status: Int, body: String = "{}") = MockResponse()
        .setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body)

    @Test fun temporaryRefreshFailuresKeepTokensAndOfferRetry() = runBlocking {
        for (status in listOf(429, 500, 503, 404)) {
            server.enqueue(response(401))
            server.enqueue(response(status))
            session.restore()
            assertEquals("old-refresh", tokens.refreshToken())
            assertEquals(SessionPhase.RestoreFailed, session.phase.value)
        }
        server.enqueue(response(401))
        server.enqueue(response(200, pair))
        server.enqueue(response(200, user))
        session.restore()
        assertTrue(session.phase.value is SessionPhase.Authenticated)
        assertEquals("new-refresh", tokens.refreshToken())
    }

    @Test fun malformedSuccessfulRefreshDoesNotCrashOrClearTheSession() = runBlocking {
        for (body in listOf("not json", "{}", """{"accessToken":"","refreshToken":""}""")) {
            server.enqueue(response(401))
            server.enqueue(response(200, body))
            session.restore()
            assertEquals("old-refresh", tokens.refreshToken())
            assertEquals(SessionPhase.RestoreFailed, session.phase.value)
        }
    }

    @Test fun rejectedRefreshClearsSessionWithoutCallingLogout() = runBlocking {
        for (status in listOf(401, 403)) {
            tokens.setTokens(TokenPair("old-access", "old-refresh"))
            server.enqueue(response(401))
            server.enqueue(response(status))
            session.restore()
            assertNull(tokens.refreshToken())
            assertEquals(SessionPhase.Unauthenticated, session.phase.value)
        }
        assertEquals(4, server.requestCount)
    }

    @Test fun directServerErrorWithMisleadingBodyKeepsSession() = runBlocking {
        server.enqueue(response(503, """{"status":401,"detail":"Temporary outage"}"""))
        session.restore()
        assertEquals("old-refresh", tokens.refreshToken())
        assertEquals(SessionPhase.RestoreFailed, session.phase.value)
    }

    @Test fun simultaneous401sRotateOnlyOnce() = runBlocking {
        val initialRequests = CountDownLatch(2)
        val rotations = AtomicInteger()
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.path == "/v1/auth/refresh") {
                    rotations.incrementAndGet()
                    return response(200, pair)
                }
                if (request.getHeader("Authorization") == "Bearer old-access") {
                    initialRequests.countDown()
                    check(initialRequests.await(5, TimeUnit.SECONDS))
                    return response(401)
                }
                return response(200, user)
            }
        }
        val calls = (1..2).map {
            async(Dispatchers.IO) {
                client.newCall(Request.Builder().url(server.url("/v1/auth/me")).build()).execute().use { it.code }
            }
        }
        assertEquals(listOf(200, 200), calls.awaitAll())
        assertEquals(1, rotations.get())
        assertEquals("new-refresh", tokens.refreshToken())
    }

    @Test fun logoutWhileRefreshingCannotRestoreOldTokens() = runBlocking {
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.path == "/v1/auth/refresh") {
                    started.countDown()
                    check(release.await(5, TimeUnit.SECONDS))
                    return response(200, pair)
                }
                return response(401)
            }
        }
        val result = async(Dispatchers.IO) {
            runCatching { client.newCall(Request.Builder().url(server.url("/v1/auth/me")).build()).execute().close() }
        }
        assertTrue(withContext(Dispatchers.IO) { started.await(5, TimeUnit.SECONDS) })
        tokens.clear()
        release.countDown()
        assertTrue(result.await().exceptionOrNull() is IOException)
        assertNull(tokens.refreshToken())
        assertNull(tokens.accessToken)
    }

    @Test fun oldTokenRejectionCannotClearANewerLogin() = runBlocking {
        tokens.setTokens(TokenPair("other-access", "other-refresh"))
        assertFalse(tokens.clearIfRefreshToken("old-refresh"))
        assertFalse(tokens.replaceTokens("old-refresh", TokenPair("late-access", "late-refresh")))
        session.forceUnauthenticated()
        assertEquals("other-refresh", tokens.refreshToken())
        assertEquals("other-access", tokens.accessToken)
    }
}
