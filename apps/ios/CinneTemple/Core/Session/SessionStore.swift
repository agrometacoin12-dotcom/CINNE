//
//  SessionStore.swift
//  CinneTemple
//
//  The single source of truth for authentication state. Owns the token
//  lifecycle (Keychain), the current user, biometric locking, and offline
//  hydration. Conforms to TokenProviding so the APIClient can refresh on 401.
//

import Foundation
import Combine
import SwiftUI

@MainActor
final class SessionStore: ObservableObject {

    enum Phase: Equatable {
        case loading
        case unauthenticated
        case locked          // session exists but biometric unlock required
        case authenticated
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var user: CurrentUser?
    @Published var biometricEnabled: Bool {
        didSet { UserDefaults.standard.set(biometricEnabled, forKey: Self.biometricKey) }
    }

    private static let biometricKey = "ct.biometricEnabled"
    private static let userCacheKey = "currentUser"

    private let api: AuthAPI
    private let keychain: KeychainStore
    private let cache: OfflineCache
    let biometrics: BiometricAuthenticator

    private var accessToken: String?

    init(api: AuthAPI, keychain: KeychainStore, cache: OfflineCache, biometrics: BiometricAuthenticator) {
        self.api = api
        self.keychain = keychain
        self.cache = cache
        self.biometrics = biometrics
        self.biometricEnabled = UserDefaults.standard.bool(forKey: Self.biometricKey)
    }

    var deviceId: String { keychain.deviceId() }

    // MARK: - Bootstrap

    /// Called at launch: hydrate from cache, then decide whether to unlock,
    /// restore, or show the sign-in flow.
    func bootstrap() async {
        accessToken = keychain.get(.accessToken)
        user = cache.load(CurrentUser.self, for: Self.userCacheKey)

        guard keychain.get(.refreshToken) != nil else {
            phase = .unauthenticated
            return
        }

        if biometricEnabled, biometrics.availableBiometry() != .none {
            phase = .locked
            return
        }
        await restore()
    }

    /// Attempts to load the current user using stored tokens.
    func restore() async {
        do {
            let me = try await api.me()
            apply(user: me)
            phase = .authenticated
        } catch {
            // Token invalid/expired and refresh failed → require sign-in.
            if user != nil {
                // We have a cached user but no valid token: surface offline view
                // by keeping the user but marking unauthenticated for actions.
            }
            await signOut()
        }
    }

    func unlockWithBiometrics() async {
        let ok = await biometrics.authenticate(reason: "Unlock CinneTemple")
        if ok {
            await restore()
        }
    }

    // MARK: - Auth actions

    func completeLogin(with pair: TokenPair) async {
        store(pair)
        await restore()
    }

    func refreshUser() async {
        guard let me = try? await api.me() else { return }
        apply(user: me)
    }

    func signOut() async {
        if let refresh = keychain.get(.refreshToken) {
            try? await api.logout(refreshToken: refresh)
        }
        keychain.remove(.accessToken)
        keychain.remove(.refreshToken)
        cache.remove(Self.userCacheKey)
        accessToken = nil
        user = nil
        phase = .unauthenticated
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
        guard let refresh = keychain.get(.refreshToken) else { return false }
        do {
            let pair = try await api.refresh(refreshToken: refresh)
            store(pair)
            return true
        } catch {
            return false
        }
    }
}
