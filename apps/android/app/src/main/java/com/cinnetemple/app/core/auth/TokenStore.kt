package com.cinnetemple.app.core.auth

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.cinnetemple.app.core.network.dto.TokenPair
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "ct_session")

/**
 * Token storage mirroring the iOS KeychainStore policy:
 *  - refresh token PERSISTED (DataStore preferences),
 *  - access token IN MEMORY ONLY (JWT, 900s TTL — never worth persisting),
 *  - per-install deviceId (sent in login/register so the user can recognise
 *    this device in the sessions list),
 *  - biometric-lock preference.
 */
class TokenStore(private val context: Context) {

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
        context.sessionDataStore.data.first()[Keys.REFRESH]

    suspend fun hasSession(): Boolean = refreshToken() != null

    /** Stores a rotated pair — ALWAYS replaces both tokens. */
    suspend fun setTokens(pair: TokenPair) {
        accessToken = pair.accessToken
        context.sessionDataStore.edit { it[Keys.REFRESH] = pair.refreshToken }
    }

    suspend fun clear() {
        accessToken = null
        context.sessionDataStore.edit { it.remove(Keys.REFRESH) }
    }

    /** Stable per-install UUID. */
    suspend fun deviceId(): String {
        val existing = context.sessionDataStore.data.first()[Keys.DEVICE]
        if (existing != null) return existing
        val fresh = UUID.randomUUID().toString()
        context.sessionDataStore.edit { it[Keys.DEVICE] = fresh }
        return fresh
    }

    val biometricLockEnabled: Flow<Boolean> =
        context.sessionDataStore.data.map { it[Keys.BIOMETRIC] ?: false }

    suspend fun isBiometricLockEnabled(): Boolean =
        context.sessionDataStore.data.first()[Keys.BIOMETRIC] ?: false

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        context.sessionDataStore.edit { it[Keys.BIOMETRIC] = enabled }
    }
}
