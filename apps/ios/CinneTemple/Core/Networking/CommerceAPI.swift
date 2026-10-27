//
//  CommerceAPI.swift
//  CinneTemple
//
//  Typed wrapper over the mobile-cinema endpoints: purchases (incl. Apple IAP +
//  gifting), entitlements, playback authorization, and premiere live chat.
//

import Foundation
import StoreKit

final class CommerceAPI {
    private let client: APIClient
    init(client: APIClient) { self.client = client }

    func buyWithCoins(titleId: String, idempotencyKey: String, sandbox: Bool = false) async throws -> PurchaseResult {
        let path = sandbox ? "v1/purchases/coins/sandbox" : "v1/purchases/coins"
        return try await client.send(path, method: .post,
            body: CoinTicketBody(titleId: titleId, idempotencyKey: idempotencyKey), authenticated: true)
    }
    func appleCoinProducts() async throws -> [AppleCoinPack] {
        try await client.send("v1/wallet/apple/products", authenticated: true)
    }
    func wallet(sandbox: Bool = false) async throws -> CoinWalletSummary {
        try await client.send(sandbox ? "v1/wallet/apple/sandbox" : "v1/wallet", authenticated: true)
    }
    func confirmAppleCoins(signedTransaction: String) async throws -> CoinCredit {
        try await client.send("v1/wallet/apple/confirm", method: .post,
            body: AppleCoinBody(signedTransaction: signedTransaction), authenticated: true)
    }

    // MARK: Purchases

    /// Server-side purchase (used for gifting and as a fallback). For the buyer's
    /// own ticket on device, prefer StoreKit via `TicketStore` + `confirmApple`.
    func purchase(titleId: String, beneficiaryEmail: String? = nil) async throws -> PurchaseResult {
        try await client.send(
            "v1/purchases", method: .post,
            body: PurchaseBody(titleId: titleId, beneficiaryEmail: beneficiaryEmail),
            authenticated: true
        )
    }

    /// Confirm a completed StoreKit transaction so the server grants entitlement.
    func confirmApple(titleId: String, transactionId: String, signedTransaction: String) async throws -> PurchaseResult {
        try await client.send(
            "v1/purchases/apple", method: .post,
            body: ConfirmAppleBody(titleId: titleId, transactionId: transactionId, signedTransaction: signedTransaction),
            authenticated: true
        )
    }

    func verify(reference: String) async throws -> VerifyResult {
        let r = reference.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? reference
        return try await client.send("v1/purchases/verify?reference=\(r)", authenticated: true)
    }

    func entitlements() async throws -> [EntitlementItem] {
        try await client.send("v1/entitlements", authenticated: true)
    }

    // MARK: Playback

    /// Authorize playback. No `episodeId` = the movie flow (empty body, exactly
    /// as before); an `episodeId` targets one episode of a series and returns
    /// an episode-shaped session (episodeId + episodeName populated).
    func playbackStart(titleId: String, episodeId: String? = nil) async throws -> PlaybackSession {
        if let episodeId {
            return try await client.send(
                "v1/playback/\(titleId)/start", method: .post,
                body: StartEpisodeBody(episodeId: episodeId), authenticated: true, query: [URLQueryItem(name: "format", value: "hls")]
            )
        }
        return try await client.send("v1/playback/\(titleId)/start", method: .post, authenticated: true, query: [URLQueryItem(name: "format", value: "hls")])
    }

    func preparePlayback(titleId: String) async throws -> PlaybackPreparation {
        try await client.send("v1/playback/\(titleId)/prepare", method: .post, authenticated: true)
    }

    func playbackStatus(titleId: String, episodeId: String? = nil) async throws -> PlaybackStatus {
        var path = "v1/playback/\(titleId)/status"
        if let episodeId { path += "?episodeId=\(episodeId)" }
        return try await client.send(path, authenticated: true)
    }

    // MARK: Premieres

    func premieres() async throws -> [CatalogueTitle] {
        try await client.send("v1/premieres")
    }

    func premiereRoom(titleId: String) async throws -> PremiereRoom {
        try await client.send("v1/premieres/\(titleId)/room", authenticated: true)
    }

    func premiereChat(titleId: String, since: String? = nil) async throws -> [ChatMessage] {
        var path = "v1/premieres/\(titleId)/chat"
        if let since, let q = since.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "?since=\(q)"
        }
        return try await client.send(path, authenticated: true)
    }

    func postChat(titleId: String, body: String) async throws -> ChatMessage {
        try await client.send(
            "v1/premieres/\(titleId)/chat", method: .post,
            body: ChatBody(body: body), authenticated: true
        )
    }
}

private struct PurchaseBody: Encodable {
    let titleId: String
    let beneficiaryEmail: String?
}

private struct ConfirmAppleBody: Encodable {
    let titleId: String
    let transactionId: String
    let signedTransaction: String
}

private struct ChatBody: Encodable {
    let body: String
}

private struct StartEpisodeBody: Encodable {
    let episodeId: String
}

struct PlaybackPreparation: Decodable { let url: String? }

struct AppleCoinPack: Decodable { let productId: String; let coins: Int }
struct CoinWalletSummary: Decodable { let balance: Int }
struct CoinCredit: Decodable { let status: String; let balance: Int; let coins: Int; let environment: String? }
private struct AppleCoinBody: Encodable { let signedTransaction: String }

private struct CoinTicketBody: Encodable { let titleId: String; let idempotencyKey: String }
