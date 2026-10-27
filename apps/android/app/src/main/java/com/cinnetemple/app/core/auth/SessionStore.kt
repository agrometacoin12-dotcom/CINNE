package com.cinnetemple.app.core.auth

import com.cinnetemple.app.core.network.ApiException
import com.cinnetemple.app.core.network.api.AuthApi
import com.cinnetemple.app.core.network.dto.CurrentUser
import com.cinnetemple.app.core.network.dto.LogoutRequest
import com.cinnetemple.app.core.network.dto.TokenPair
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Root app state, mirroring iOS SessionStore.phase. */
sealed interface SessionPhase {
    /** Bootstrapping — show the splash spinner. */
    data object Loading : SessionPhase

    /** A session exists but the biometric gate is on — show LockScreen. */
    data object Locked : SessionPhase

    /** No session — show the auth flow (landing/login/register). */
    data object Unauthenticated : SessionPhase

    /** A saved session could not be restored; let the viewer retry offline failures. */
    data object RestoreFailed : SessionPhase

    /** Signed in — show the tab shell. */
    data class Authenticated(val user: CurrentUser) : SessionPhase
}

/**
 * Session state machine. Create once (AppContainer), observe [phase] from the
 * root composable.
 */
class SessionStore(
    private val tokenStore: TokenStore,
    private val authApi: AuthApi,
    private val scope: CoroutineScope,
) {
    private val _phase = MutableStateFlow<SessionPhase>(SessionPhase.Loading)
    val phase: StateFlow<SessionPhase> = _phase.asStateFlow()
    private var generation = 0

    val currentUser: CurrentUser?
        get() = (_phase.value as? SessionPhase.Authenticated)?.user

    val isAdmin: Boolean get() = currentUser?.isAdmin == true

    /** Called once at app start. */
    fun bootstrap() {
        scope.launch {
            if (!tokenStore.hasSession()) {
                _phase.value = SessionPhase.Unauthenticated
                return@launch
            }
            if (tokenStore.isBiometricLockEnabled()) {
                _phase.value = SessionPhase.Locked
                return@launch
            }
            restore()
        }
    }

    /**
     * Validates the persisted session via GET /v1/auth/me (the OkHttp
     * authenticator transparently refresh-rotates an expired access token).
     */
    suspend fun restore() {
        val startedGeneration = generation
        try {
            val user = authApi.me()
            if (startedGeneration != generation) return
            _phase.value = SessionPhase.Authenticated(user)
        } catch (e: ApiException) {
            if (startedGeneration != generation) return
            // Only a definitive auth rejection kills the stored session —
            // 429/5xx must not log the user out.
            if (e.status == 401 || e.status == 403) {
                tokenStore.clear()
                _phase.value = SessionPhase.Unauthenticated
            } else {
                _phase.value = SessionPhase.RestoreFailed
            }
        } catch (_: IOException) {
            if (startedGeneration != generation) return
            _phase.value = SessionPhase.RestoreFailed
        }
    }

    /**
     * Store a fresh token pair (login/register/google) and load the user.
     *
     * Deliberately runs on the store's own [scope]: flipping the phase to
     * Loading removes the calling auth screen (and its rememberCoroutineScope)
     * from composition, which would cancel a caller-scoped restore mid-flight
     * and strand the app on the splash spinner.
     */
    fun completeLogin(tokens: TokenPair) {
        scope.launch {
            generation++
            _phase.value = SessionPhase.Loading
            tokenStore.setTokens(tokens)
            restore()
        }
    }

    /** After a successful biometric prompt on the lock screen. */
    fun unlock() {
        scope.launch {
            _phase.value = SessionPhase.Loading
            restore()
        }
    }

    /** Re-fetch /me (e.g. after a profile edit) without a phase bounce. */
    suspend fun refreshUser() {
        val startedGeneration = generation
        try {
            val user = authApi.me()
            if (startedGeneration != generation) return
            _phase.value = SessionPhase.Authenticated(user)
        } catch (_: Exception) {
            // keep the existing phase
        }
    }

    /** Revokes the current session server-side (best effort) and clears local state. */
    suspend fun logout() {
        generation++
        val refresh = tokenStore.refreshToken()
        val access = tokenStore.accessToken
        tokenStore.clear()
        _phase.value = SessionPhase.Unauthenticated
        if (refresh != null && access != null) {
            try {
                authApi.logout(LogoutRequest(refresh), "Bearer $access")
            } catch (_: Exception) {
                // best effort — local clear still proceeds
            }
        }
    }

    /**
     * Invoked by the TokenAuthenticator when refresh rotation is definitively
     * rejected (revoked/suspended) — local sign-out without a server call.
     */
    fun forceUnauthenticated() {
        scope.launch {
            // The authenticator already cleared the rejected token atomically.
            // Don't let a queued invalidation erase a subsequent login.
            if (!tokenStore.hasSession()) {
                generation++
                _phase.value = SessionPhase.Unauthenticated
            }
        }
    }

    suspend fun setBiometricLockEnabled(enabled: Boolean) =
        tokenStore.setBiometricLockEnabled(enabled)
}
