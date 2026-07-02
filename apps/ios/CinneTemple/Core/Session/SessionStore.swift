//
//  SessionStore.swift
//  CinneTemple
//
//  The single source of truth for authentication state. Owns the token
//  lifecycle (Keychain), the current user, biometric locking, and offline
//  hydration. Conforms to TokenProviding so the APIClient can refresh on 401.
//
//  - Important: All methods and properties must be accessed from the main actor.
//  - Note: Conforms to `TokenProviding` for automatic token refresh in `APIClient`.
//

import Foundation
import Combine
import SwiftUI
import os.log

/// Authentication session manager.
@MainActor
final class SessionStore: ObservableObject {

    enum Phase: Equatable {
        case loading
        case unauthenticated
        case locked          // session exists but biometric unlock required
        case authenticated
        case offline         // cached user but no valid tokens (network unavailable)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var user: CurrentUser?
    @Published private(set) var biometricEnabled: Bool
    @Published private(set) var lastError: Error?

    private static let biometricKey = "ct.biometricEnabled"
    private static let userCacheKey = "currentUser"
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "CinneTemple", category: "SessionStore")

    private let api: AuthAPI
    private let keychain: KeychainStore
    private let cache: OfflineCache
    let biometrics: BiometricAuthenticator

    private var accessToken: String?
    private var refreshTask: Task<Bool, Never>?
    private var hasBootstrapped = false

    init(api: AuthAPI, keychain: KeychainStore, cache: OfflineCache, biometrics: BiometricAuthenticator) {
        self.api = api
        self.keychain = keychain
        self.cache = cache
        self.biometrics = biometrics
        self.biometricEnabled = UserDefaults.standard.bool(forKey: Self.biometricKey)
        
        // CRITICAL: After creating SessionStore, you must set it as the token provider
        // on the APIClient to enable automatic token refresh on 401 responses.
        // Example:
        //   let sessionStore = SessionStore(...)
        //   apiClient.tokenProvider = sessionStore
    }

    var deviceId: String { keychain.deviceId() }

    // MARK: - Bootstrap

    /// Called at launch: hydrate from cache, then decide whether to unlock,
    /// restore, or show the sign-in flow.
    ///
    /// This method is idempotent - calling it multiple times is safe.
    func bootstrap() async {
        // Prevent multiple bootstrap calls
        guard !hasBootstrapped else {
            Self.logger.warning("bootstrap() called multiple times; ignoring")
            return
        }
        hasBootstrapped = true
        
        accessToken = keychain.get(.accessToken)
        user = cache.load(CurrentUser.self, for: Self.userCacheKey)

        guard keychain.get(.refreshToken) != nil else {
            Self.logger.info("No refresh token found; showing sign-in")
            phase = .unauthenticated
            return
        }

        if biometricEnabled, biometrics.availableBiometry() != .none {
            Self.logger.info("Biometric unlock required")
            phase = .locked
            return
        }
        await restore()
    }

    /// Attempts to load the current user using stored tokens.
    func restore() async {
        do {
            try Task.checkCancellation()
            Self.logger.info("Restoring session...")
            let me = try await api.me()
            apply(user: me)
            phase = .authenticated
            lastError = nil
            Self.logger.info("Session restored successfully")
        } catch is CancellationError {
            Self.logger.info("Session restore cancelled")
            return
        } catch let error as APIError where error.status == 401 {
            // Auth failure - tokens are invalid, require re-authentication
            Self.logger.warning("Auth tokens invalid; signing out")
            lastError = error
            await signOut()
        } catch {
            // Network or other error - keep cached user for offline mode
            Self.logger.error("Session restore failed: \(error.localizedDescription)")
            lastError = error
            if user != nil {
                Self.logger.info("Entering offline mode with cached user")
                phase = .offline
            } else {
                Self.logger.warning("No cached user; signing out")
                await signOut()
            }
        }
    }

    /// Prompts for biometric authentication and restores session on success.
    func unlockWithBiometrics() async {
        Self.logger.info("Attempting biometric unlock...")
        let ok = await biometrics.authenticate(reason: "Unlock CinneTemple")
        if ok {
            Self.logger.info("Biometric authentication succeeded")
            await restore()
        } else {
            Self.logger.warning("Biometric authentication failed")
            lastError = SessionError.biometricAuthenticationFailed
        }
    }

    /// Allows user to proceed without biometric authentication (fallback).
    func skipBiometricUnlock() async {
        Self.logger.info("Skipping biometric unlock")
        await restore()
    }

    // MARK: - Auth actions

    func completeLogin(with pair: TokenPair) async {
        Self.logger.info("Completing login with new token pair")
        store(pair)
        await restore()
    }

    func refreshUser() async {
        guard let me = try? await api.me() else {
            Self.logger.error("Failed to refresh user info")
            return
        }
        apply(user: me)
        Self.logger.info("User info refreshed")
    }

    func signOut() async {
        Self.logger.info("Signing out...")
        if let refresh = keychain.get(.refreshToken) {
            try? await api.logout(refreshToken: refresh)
        }
        keychain.remove(.accessToken)
        keychain.remove(.refreshToken)
        cache.remove(Self.userCacheKey)
        accessToken = nil
        user = nil
        lastError = nil
        phase = .unauthenticated
        Self.logger.info("Sign out complete")
    }

    /// Updates the biometric authentication preference.
    func setBiometricEnabled(_ enabled: Bool) {
        Self.logger.info("Biometric authentication \(enabled ? "enabled" : "disabled")")
        biometricEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.biometricKey)
    }

    /// Clears the last error (useful after user dismisses an error alert).
    func clearError() {
        lastError = nil
    }

    // MARK: - Helpers

    private func store(_ pair: TokenPair) {
        accessToken = pair.accessToken
        keychain.set(pair.accessToken, for: .accessToken)
        keychain.set(pair.refreshToken, for: .refreshToken)
    }

    private func apply(user: CurrentUser) {
        self.user = user
        cache.save(user, for: Self.userCacheKey)
    }
}

// MARK: - TokenProviding

extension SessionStore: TokenProviding {
    func currentAccessToken() -> String? {
        accessToken
    }

    func refreshTokens() async -> Bool {
        // If already refreshing, await the existing task to prevent duplicate requests
        if let existing = refreshTask {
            Self.logger.info("Token refresh already in progress; awaiting existing task")
            return await existing.value
        }
        
        Self.logger.info("Starting token refresh...")
        let task = Task { @MainActor () -> Bool in
            defer { refreshTask = nil }
            
            guard let refresh = keychain.get(.refreshToken) else {
                Self.logger.error("No refresh token available")
                return false
            }
            
            do {
                let pair = try await api.refresh(refreshToken: refresh)
                store(pair)
                Self.logger.info("Token refresh successful")
                return true
            } catch {
                // On refresh failure, sign out to force re-authentication
                Self.logger.error("Token refresh failed: \(error.localizedDescription)")
                await signOut()
                return false
            }
        }
        
        refreshTask = task
        return await task.value
    }
}

// MARK: - Errors

enum SessionError: LocalizedError {
    case biometricAuthenticationFailed
    
    var errorDescription: String? {
        switch self {
        case .biometricAuthenticationFailed:
            return "Biometric authentication failed. Please try again or enter your passcode."
        }
    }
}

// MARK: - Testing Helpers

#if DEBUG
extension SessionStore {
    func _test_forcePhase(_ phase: Phase) {
        self.phase = phase
    }
    
    func _test_setUser(_ user: CurrentUser?) {
        self.user = user
    }
    
    func _test_reset() {
        hasBootstrapped = false
        phase = .loading
        user = nil
        accessToken = nil
        lastError = nil
        refreshTask?.cancel()
        refreshTask = nil
    }
}
#endif
