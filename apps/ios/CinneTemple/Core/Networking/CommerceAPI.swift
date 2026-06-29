//
//  CommerceAPI.swift
//  CinneTemple
//
//  Typed wrapper over the mobile-cinema endpoints: purchases (incl. Apple IAP +
//  gifting), entitlements, playback authorization, and premiere live chat.
//

import Foundation

final class CommerceAPI {
    private let client: APIClient
    init(client: APIClient) { self.client = client }

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

    func playbackStart(titleId: String) async throws -> PlaybackSession {
        try await client.send("v1/playback/\(titleId)/start", method: .post, authenticated: true)
    }

    func playbackStatus(titleId: String) async throws -> PlaybackStatus {
        try await client.send("v1/playback/\(titleId)/status", authenticated: true)
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
