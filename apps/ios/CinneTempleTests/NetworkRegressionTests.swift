import XCTest
import Combine
import AVFoundation
@testable import CinneTemple

private struct StubReply {
    var status = 200
    var body = "{}"
    var delay = 0.0
    var error: Error?
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var respond: ((URLRequest) -> StubReply)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let reply = Self.respond?(request) else { return }
        let send = { [self] in
            if let error = reply.error { client?.urlProtocol(self, didFailWithError: error); return }
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
        if reply.delay > 0 { DispatchQueue.global().asyncAfter(deadline: .now() + reply.delay, execute: send) }
        else { send() }
    }
    override func stopLoading() {}
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var stored = 0
    func increment() -> Int { lock.lock(); defer { lock.unlock() }; stored += 1; return stored }
    var value: Int { lock.lock(); defer { lock.unlock() }; return stored }
}

@MainActor
final class NetworkRegressionTests: XCTestCase {
    func testSandboxStorageCannotReadProductionSession() {
        let live = URL(string: "https://api.cinnetemple.com")!
        let test = URL(string: "https://iap-api-production.up.railway.app")!
        XCTAssertEqual(AppConfig.keychainService(for: live), "com.cinnetemple.app")
        XCTAssertEqual(AppConfig.storageNamespace(for: live), "cinnetemple")
        XCTAssertNotEqual(AppConfig.keychainService(for: live), AppConfig.keychainService(for: test))
        XCTAssertNotEqual(AppConfig.storageNamespace(for: live), AppConfig.storageNamespace(for: test))
        XCTAssertNotEqual(AppConfig.storageNamespace(for: test), AppConfig.storageNamespace(for: URL(string: "https://other-test.example")!))
    }

    private let me = #"{"id":"viewer","email":"viewer@example.test","emailVerified":true,"mfaEnabled":false,"status":"ACTIVE","roles":[],"profile":null}"#
    private let tokens = #"{"accessToken":"new-access","refreshToken":"new-refresh","tokenType":"Bearer","expiresIn":900}"#

    private struct Fixture {
        let client: APIClient
        let session: SessionStore
        let keychain: KeychainStore
        let cache: OfflineCache
        let urlSession: URLSession
        let previousBiometricPreference: Any?
    }
    private func fixture(cachedUser: Bool = false) throws -> Fixture {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        let urlSession = URLSession(configuration: configuration)
        let client = APIClient(baseURL: URL(string: "https://fixture.test/")!, session: urlSession)
        let keychain = KeychainStore(service: "com.cinnetemple.tests.\(UUID().uuidString)")
        keychain.set("old-access", for: .accessToken)
        keychain.set("old-refresh", for: .refreshToken)
        XCTAssertEqual(keychain.get(.refreshToken), "old-refresh", "Run simulator tests with local code signing so Keychain is available.")
        let cache = OfflineCache(directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        if cachedUser { cache.save(try JSONDecoder().decode(CurrentUser.self, from: Data(me.utf8)), for: "currentUser") }
        let session = SessionStore(api: AuthAPI(client: client), keychain: keychain, cache: cache, biometrics: BiometricAuthenticator())
        let previousBiometricPreference = UserDefaults.standard.object(forKey: "ct.biometricEnabled")
        session.setBiometricEnabled(false)
        client.tokenProvider = session
        return Fixture(client: client, session: session, keychain: keychain, cache: cache, urlSession: urlSession, previousBiometricPreference: previousBiometricPreference)
    }
    private func clean(_ f: Fixture) {
        UserDefaults.standard.set(f.previousBiometricPreference, forKey: "ct.biometricEnabled")
        f.urlSession.invalidateAndCancel()
        f.keychain.remove(.accessToken)
        f.keychain.remove(.refreshToken)
        f.cache.remove("currentUser")
        StubProtocol.respond = nil
    }

    func testTicketPurchaseUsesExplicitWalletEnvironment() async throws {
        let f = try fixture()
        defer { clean(f) }
        var paths: [String] = []
        StubProtocol.respond = { request in
            paths.append(request.url!.path)
            return StubReply(body: #"{"status":"paid","titleId":"title"}"#)
        }
        let api = CommerceAPI(client: f.client)
        _ = try await api.buyWithCoins(titleId: "title", idempotencyKey: "one", sandbox: true)
        _ = try await api.buyWithCoins(titleId: "title", idempotencyKey: "two", sandbox: false)
        XCTAssertEqual(paths, ["/v1/purchases/coins/sandbox", "/v1/purchases/coins"])
    }

    func testSharedTestWalletKeepsAppleDiscoveryEnabled() async throws {
        let f = try fixture()
        defer { clean(f) }
        let user = me, pair = tokens
        var paths: [String] = []
        StubProtocol.respond = { request in
            let path = request.url!.path
            paths.append(path)
            if path.hasSuffix("/refresh") { return StubReply(body: pair) }
            if path == "/v1/wallet" { return StubReply(body: #"{"balance":1000}"#) }
            if path == "/v1/wallet/apple/sandbox" { return StubReply(body: #"{"balance":500}"#) }
            return StubReply(body: user)
        }
        await f.session.bootstrap()
        XCTAssertEqual(f.session.phase, .authenticated)
        var appleRequested = false
        var environmentUnavailable = false
        let store = TicketStore(commerce: CommerceAPI(client: f.client), session: f.session,
                                sandboxEnvironment: {
                                    if environmentUnavailable { throw URLError(.notConnectedToInternet) }
                                    return true
                                }) { _ in
            appleRequested = true
            return []
        }
        await store.loadProducts()
        XCTAssertEqual(store.balance, 1000)
        XCTAssertFalse(store.sandboxPurchases)
        await store.selectWallet(sandbox: true)
        XCTAssertEqual(store.balance, 500)
        XCTAssertTrue(store.sandboxPurchases)
        XCTAssertTrue(appleRequested)
        XCTAssertTrue(paths.contains("/v1/wallet/apple/sandbox"))
        XCTAssertFalse(paths.contains(where: { $0.contains("korapay") }))
        environmentUnavailable = true
        try await store.refreshBalance()
        XCTAssertTrue(store.sandboxPurchases)
        XCTAssertEqual(store.balance, 500)
    }

    func testCoinPurchaseHistoryDecodesLiveAndTestEntries() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { request in
            XCTAssertEqual(request.url!.path, "/v1/wallet/purchases")
            return StubReply(body: #"[{"id":"live","coins":500,"status":"PAID","source":"Browser payment","environment":"Production","createdAt":"2026-10-26T12:00:00Z"},{"id":"test","coins":1000,"status":"REFUNDED","source":"App Store","environment":"Sandbox","createdAt":"2026-10-26T11:00:00Z"}]"#)
        }
        let entries = try await f.client.coinPurchaseHistory()
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries[0].coins, 500)
        XCTAssertEqual(entries[0].environment, "Production")
        XCTAssertEqual(entries[1].status, "REFUNDED")
        XCTAssertEqual(entries[1].environment, "Sandbox")
    }

    func testCoinDiscoveryStillContactsAppleWhenBackendIsUnavailable() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { _ in StubReply(status: 503) }
        var requestedIDs: [String] = []
        let store = TicketStore(commerce: CommerceAPI(client: f.client), session: f.session) { ids in
            requestedIDs = ids
            return []
        }
        await store.loadProducts()
        XCTAssertEqual(requestedIDs, TicketStore.productIDs)
        XCTAssertTrue(store.productLoadError?.contains("App Store returned no coin packs") == true)
        XCTAssertFalse(store.loadingProducts)
    }

    func testCoinPriceErrorRemainsDistinctFromWalletFailure() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { _ in StubReply(status: 503) }
        let store = TicketStore(commerce: CommerceAPI(client: f.client), session: f.session) { _ in
            throw URLError(.notConnectedToInternet)
        }
        await store.loadProducts()
        XCTAssertTrue(store.productLoadError?.contains("Could not load App Store prices") == true)
        XCTAssertEqual(store.message, "Could not refresh your coin balance. Please try again.")
        XCTAssertFalse(store.loadingProducts)
    }

    func testRefreshOutagesRetainCredentialsWithoutCachedUserAndCanRetry() async throws {
        for status in [429, 500, 503, 404] {
            let f = try fixture()
            defer { clean(f) }
            StubProtocol.respond = { request in
                StubReply(status: request.url!.path.hasSuffix("/refresh") ? status : 401)
            }
            await f.session.bootstrap()
            XCTAssertEqual(f.session.phase, .restoreFailed)
            XCTAssertEqual(f.keychain.get(.refreshToken), "old-refresh")
            let pair = tokens, user = me
            StubProtocol.respond = { request in
                if request.url!.path.hasSuffix("/refresh") { return StubReply(body: pair) }
                return request.value(forHTTPHeaderField: "Authorization") == "Bearer new-access"
                    ? StubReply(body: user) : StubReply(status: 401)
            }
            await f.session.retryRestore()
            XCTAssertEqual(f.session.phase, .authenticated)
            XCTAssertEqual(f.keychain.get(.refreshToken), "new-refresh")
        }
    }

    func testNetworkFailureRetainsCachedUserOffline() async throws {
        let f = try fixture(cachedUser: true)
        defer { clean(f) }
        StubProtocol.respond = { request in
            request.url!.path.hasSuffix("/refresh")
                ? StubReply(error: URLError(.notConnectedToInternet)) : StubReply(status: 401)
        }
        await f.session.bootstrap()
        XCTAssertEqual(f.session.phase, .offline)
        XCTAssertNotNil(f.session.user)
        XCTAssertEqual(f.keychain.get(.refreshToken), "old-refresh")
    }

    func testMalformedRefreshResponseRetainsCredentials() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { request in
            request.url!.path.hasSuffix("/refresh") ? StubReply(body: "not json") : StubReply(status: 401)
        }
        await f.session.bootstrap()
        XCTAssertEqual(f.session.phase, .restoreFailed)
        XCTAssertEqual(f.keychain.get(.refreshToken), "old-refresh")
    }

    func testRejectedRefreshInvalidatesWithoutRecursiveLogout() async throws {
        for status in [401, 403] {
            let f = try fixture()
            defer { clean(f) }
            let requests = Counter()
            StubProtocol.respond = { request in
                _ = requests.increment()
                return StubReply(status: request.url!.path.hasSuffix("/refresh") ? status : 401)
            }
            await f.session.bootstrap()
            XCTAssertEqual(f.session.phase, .unauthenticated)
            XCTAssertNil(f.keychain.get(.refreshToken))
            XCTAssertEqual(requests.value, 2)
        }
    }

    func testConcurrent401sUseOneRotationEvenWhenOne401ArrivesLate() async throws {
        let f = try fixture()
        defer { clean(f) }
        let rotations = Counter(), failures = Counter()
        let pair = tokens, user = me
        StubProtocol.respond = { request in
            if request.url!.path.hasSuffix("/refresh") { _ = rotations.increment(); return StubReply(body: pair, delay: 0.05) }
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer new-access" { return StubReply(body: user) }
            return StubReply(status: 401, delay: failures.increment() == 1 ? 0 : 0.15)
        }
        let first = Task { @MainActor () throws -> CurrentUser in
            try await f.client.send("v1/auth/me", authenticated: true)
        }
        let second = Task { @MainActor () throws -> CurrentUser in
            try await f.client.send("v1/auth/me", authenticated: true)
        }
        let users = try await [first.value, second.value]
        XCTAssertEqual(users.count, 2)
        XCTAssertEqual(rotations.value, 1)
    }

    func testLogoutDuringRefreshCannotResurrectCredentials() async throws {
        let f = try fixture()
        defer { clean(f) }
        let began = expectation(description: "refresh began")
        let pair = tokens
        StubProtocol.respond = { request in
            if request.url!.path.hasSuffix("/refresh") { began.fulfill(); return StubReply(body: pair, delay: 0.15) }
            return StubReply()
        }
        let pending = Task { try await f.session.refreshTokens() }
        await fulfillment(of: [began], timeout: 2)
        await f.session.signOut()
        _ = try? await pending.value
        XCTAssertNil(f.keychain.get(.refreshToken))
        XCTAssertNil(f.session.currentAccessToken())
        XCTAssertEqual(f.session.phase, .unauthenticated)
    }

    func testOldRefreshCannotOverwriteNewLogin() async throws {
        let f = try fixture()
        defer { clean(f) }
        let began = expectation(description: "refresh began")
        let pair = tokens, user = me
        StubProtocol.respond = { request in
            if request.url!.path.hasSuffix("/refresh") { began.fulfill(); return StubReply(body: pair, delay: 0.15) }
            return StubReply(body: user)
        }
        let pending = Task { try await f.session.refreshTokens() }
        await fulfillment(of: [began], timeout: 2)
        await f.session.completeLogin(with: TokenPair(accessToken: "other-access", refreshToken: "other-refresh", tokenType: "Bearer", expiresIn: 900))
        _ = try? await pending.value
        XCTAssertEqual(f.keychain.get(.refreshToken), "other-refresh")
        XCTAssertEqual(f.session.currentAccessToken(), "other-access")
        XCTAssertEqual(f.session.phase, .authenticated)
    }

    func testHTTPStatusOverridesMisleadingProblemJSON() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { _ in StubReply(status: 503, body: #"{"status":401,"detail":"Temporary outage"}"#) }
        await f.session.bootstrap()
        XCTAssertEqual(f.session.phase, .restoreFailed)
        XCTAssertEqual(f.keychain.get(.refreshToken), "old-refresh")
    }

    func testSearchEncodesAmpersandsPlusUnicodeAndFragmentAsOneValue() async throws {
        let f = try fixture()
        defer { clean(f) }
        let query = "Love & War + C++ #1 / Ìfẹ́?"
        StubProtocol.respond = { request in
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
            XCTAssertEqual(components.path, "/v1/catalogue/search")
            XCTAssertEqual(components.queryItems, [URLQueryItem(name: "q", value: query)])
            XCTAssertFalse(components.percentEncodedQuery!.contains("+"))
            XCTAssertNil(components.fragment)
            return StubReply(body: #"{"query":"test","results":[]}"#)
        }
        _ = try await CatalogueAPI(client: f.client).search(query: query)
    }

    func testPlayAccessDoesNotWaitForTitleAndWatchlistRequests() async throws {
        let f = try fixture()
        defer { clean(f) }
        let user = me
        StubProtocol.respond = { _ in StubReply(body: user) }
        await f.session.bootstrap()
        let commerce = CommerceAPI(client: f.client)
        let model = TitleDetailViewModel(
            titleId: "film", api: CatalogueAPI(client: f.client), commerce: commerce,
            client: f.client, ticketStore: TicketStore(commerce: commerce, session: f.session), session: f.session
        )
        let accessReady = expectation(description: "Play access arrived independently")
        let observation = model.$hasAccess.filter { $0 }.first().sink { _ in accessReady.fulfill() }
        defer { observation.cancel() }
        StubProtocol.respond = { request in
            if request.url!.path.hasSuffix("/status") {
                return StubReply(body: #"{"titleId":"film","hasAccess":true,"started":false,"premiere":false,"premiereLive":false}"#)
            }
            if request.url!.path.hasSuffix("/watchlist") { return StubReply(body: "[]", delay: 1) }
            return StubReply(status: 404, delay: 1)
        }
        let loading = Task { await model.load() }
        await fulfillment(of: [accessReady], timeout: 3)
        XCTAssertNil(model.error, "Access must arrive before the delayed title response")
        await loading.value
        XCTAssertTrue(model.hasAccess)
        XCTAssertNotNil(model.error)
    }

    func testPlaybackRequestsHlsAndReadsResumePositionWithLegacyCompatibility() async throws {
        let f = try fixture()
        defer { clean(f) }
        for resume in [",\"resumeSeconds\":120", ""] {
            StubProtocol.respond = { request in
                XCTAssertEqual(request.url!.path, "/v1/playback/film/start")
                XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems,
                               [URLQueryItem(name: "format", value: "hls")])
                return StubReply(body: "{\"titleId\":\"film\",\"title\":\"Film\",\"url\":\"https://fixture.test/master.m3u8\",\"durationSeconds\":1000,\"watermark\":\"viewer\",\"sessionId\":\"ticket\",\"expiresAt\":null" + resume + "}")
            }
            let session = try await CommerceAPI(client: f.client).playbackStart(titleId: "film")
            XCTAssertEqual(session.resumeSeconds, resume.isEmpty ? nil : 120)
        }
    }

    func testPreparedMovieDoesNotReportProgressBeforeIntroFinishes() async throws {
        let f = try fixture()
        defer { clean(f) }
        URLProtocol.registerClass(StubProtocol.self)
        defer { URLProtocol.unregisterClass(StubProtocol.self) }
        let sent = expectation(description: "No progress while movie has never played")
        sent.isInverted = true
        StubProtocol.respond = { request in
            if request.url?.path.hasSuffix("/progress") == true { sent.fulfill() }
            return StubReply()
        }
        let movie = AVPlayer(playerItem: AVPlayerItem(asset: AVMutableComposition()))
        let reporter = PlaybackProgressReporter(titleId: "film", fallbackDurationSeconds: 120,
            tokenProvider: f.session, baseURL: URL(string: "https://fixture.test")!)
        reporter.attach(to: movie)
        reporter.flush()
        reporter.detach()
        await fulfillment(of: [sent], timeout: 0.3)
    }

    func testCheckoutUsesClientSessionAndCorrectQueryEncoding() async throws {
        let f = try fixture()
        defer { clean(f) }
        StubProtocol.respond = { request in
            XCTAssertEqual(request.url!.host, "fixture.test")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems,
                           [URLQueryItem(name: "reference", value: "ticket+1&2")])
            return StubReply(body: #"{"status":"paid","titleId":"film"}"#)
        }
        _ = try await f.client.verifyPurchase(reference: "ticket+1&2")
    }
}
