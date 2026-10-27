//
//  APIClient+Checkout.swift
//  CinneTemple
//
//  Checkout-surface endpoints owned by the Checkout feature:
//  GET /v1/purchases/verify?reference= and GET /v1/purchases (history).
//

import Foundation

/// One row of the buyer's purchase history (GET /v1/purchases).
struct PurchaseRecord: Decodable, Identifiable {
    let id: String
    let titleId: String
    let titleName: String
    let amountMinor: Int
    let currency: String
    let status: String          // PENDING | PAID | FAILED | REFUNDED
    let isGift: Bool
    let createdAt: String
}

struct CoinPurchaseRecord: Decodable, Identifiable {
    let id: String
    let coins: Int
    let status: String
    let source: String
    let environment: String
    let createdAt: String
}

extension APIClient {
    func coinPurchaseHistory() async throws -> [CoinPurchaseRecord] {
        try await send("v1/wallet/purchases", authenticated: true)
    }


    /// Idempotent payment verification — safe to poll.
    func verifyPurchase(reference: String) async throws -> VerifyResult {
        try await send(
            "v1/purchases/verify", authenticated: true,
            query: [URLQueryItem(name: "reference", value: reference)]
        )
    }

    /// The buyer's purchase history (includes gifts sent), newest first.
    func purchaseHistory() async throws -> [PurchaseRecord] {
        try await send("v1/purchases", authenticated: true)
    }

}
