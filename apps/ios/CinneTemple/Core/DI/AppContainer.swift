//
//  AppContainer.swift
//  CinneTemple
//
//  Composition root / dependency-injection container. Builds the object graph
//  once and hands it to the SwiftUI environment.
//

import Foundation

@MainActor
final class AppContainer {
    let apiClient: APIClient
    let authAPI: AuthAPI
    let catalogueAPI: CatalogueAPI
    let commerceAPI: CommerceAPI
    let ticketStore: TicketStore
    let cache: OfflineCache
    let session: SessionStore
    let backgroundSync: BackgroundSyncManager
    let pushManager: PushManager

    init() {
        let baseURL = AppConfig.apiBaseURL
        let client = APIClient(baseURL: baseURL)
        let authAPI = AuthAPI(client: client)
        let cache = OfflineCache(namespace: AppConfig.storageNamespace(for: baseURL))
        let session = SessionStore(
            api: authAPI,
            keychain: KeychainStore(service: AppConfig.keychainService(for: baseURL)),
            cache: cache,
            biometrics: BiometricAuthenticator()
        )
        // Wire the client back to the session for bearer auth + refresh.
        client.tokenProvider = session

        let catalogueAPI = CatalogueAPI(client: client)
        let commerceAPI = CommerceAPI(client: client)
        self.apiClient = client
        self.authAPI = authAPI
        self.catalogueAPI = catalogueAPI
        self.commerceAPI = commerceAPI
        self.ticketStore = TicketStore(commerce: commerceAPI, session: session)
        self.cache = cache
        self.session = session
        self.backgroundSync = BackgroundSyncManager(catalogueAPI: catalogueAPI, cache: cache)
        self.pushManager = PushManager(api: NotificationsAPI(client: client), session: session)
    }

    /// View models are created via the container so dependencies stay explicit.
    func makeAuthViewModel() -> AuthViewModel {
        AuthViewModel(api: authAPI, session: session)
    }

    func makeCatalogueViewModel() -> CatalogueViewModel {
        CatalogueViewModel(api: catalogueAPI, cache: cache)
    }

    func makeSearchViewModel() -> SearchViewModel {
        SearchViewModel(api: catalogueAPI)
    }

    func makeWatchlistViewModel() -> WatchlistViewModel {
        WatchlistViewModel(api: catalogueAPI)
    }
}

enum AppConfig {
    static var isTestEnvironment: Bool { apiBaseURL.host != "api.cinnetemple.com" }

    static func storageNamespace(for url: URL) -> String {
        guard url == URL(string: "https://api.cinnetemple.com") else {
            return "cinnetemple-test-" + Data(url.absoluteString.utf8).map { String(format: "%02x", $0) }.joined()
        }
        return "cinnetemple"
    }

    static func keychainService(for url: URL) -> String {
        let namespace = storageNamespace(for: url)
        return namespace == "cinnetemple" ? "com.cinnetemple.app" : "com.cinnetemple.app.\(namespace)"
    }

    /// API base URL. Override with the `API_BASE_URL` build setting / env.
    /// For local backend use http://localhost:4000 (add an ATS exception, see
    /// the iOS README). Defaults to the production API.
    static var apiBaseURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://api.cinnetemple.com")!
    }
}
