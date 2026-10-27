package com.cinnetemple.app.core.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.cinnetemple.app.core.network.dto.TokenPair
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private val Context.sessionDataStore by preferencesDataStore(name = "ct_session")

/**
 * Token storage mirroring the iOS KeychainStore policy:
 *  - refresh token PERSISTED (DataStore preferences),
 *  - access token IN MEMORY ONLY (JWT, 900s TTL — never worth persisting),
 *  - per-install deviceId (sent in login/register so the user can recognise
 *    this device in the sessions list),
 *  - biometric-lock preference.
 */
class TokenStore internal constructor(private val dataStore: DataStore<Preferences>) {
    constructor(context: Context) : this(context.sessionDataStore)
    private val mutationLock = Mutex()

    private object Keys {
        val REFRESH = stringPreferencesKey("ct.refresh")
        val DEVICE = stringPreferencesKey("ct.device")
        val BIOMETRIC = booleanPreferencesKey("ct.biometricEnabled")
    }

    /** Short-lived JWT; readable synchronously from OkHttp threads. */
    @Volatile
    var accessToken: String? = null
        private set

    suspend fun refreshToken(): String? =
        dataStore.data.first()[Keys.REFRESH]

    suspend fun hasSession(): Boolean = refreshToken() != null

    /** Stores a rotated pair — ALWAYS replaces both tokens. */
    suspend fun setTokens(pair: TokenPair) = mutationLock.withLock {
        dataStore.edit { it[Keys.REFRESH] = pair.refreshToken }
        accessToken = pair.accessToken
    }

    suspend fun clear() = mutationLock.withLock {
        dataStore.edit { it.remove(Keys.REFRESH) }
        accessToken = null
    }

    /** A late refresh must never overwrite a logout or a newer login. */
    suspend fun replaceTokens(expectedRefresh: String, pair: TokenPair): Boolean = mutationLock.withLock {
        if (refreshToken() != expectedRefresh) return@withLock false
        dataStore.edit { it[Keys.REFRESH] = pair.refreshToken }
        accessToken = pair.accessToken
        true
    }

    suspend fun clearIfRefreshToken(expectedRefresh: String): Boolean = mutationLock.withLock {
        if (refreshToken() != expectedRefresh) return@withLock false
        dataStore.edit { it.remove(Keys.REFRESH) }
        accessToken = null
        true
    }

    /** Stable per-install UUID. */
    suspend fun deviceId(): String {
        val existing = dataStore.data.first()[Keys.DEVICE]
        if (existing != null) return existing
        val fresh = UUID.randomUUID().toString()
        dataStore.edit { it[Keys.DEVICE] = fresh }
        return fresh
    }

    val biometricLockEnabled: Flow<Boolean> =
        dataStore.data.map { it[Keys.BIOMETRIC] ?: false }

    suspend fun isBiometricLockEnabled(): Boolean =
        dataStore.data.first()[Keys.BIOMETRIC] ?: false

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        dataStore.edit { it[Keys.BIOMETRIC] = enabled }
    }
}
