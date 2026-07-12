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

extension APIClient {

    /// Idempotent payment verification — safe to poll.
    func verifyPurchase(reference: String) async throws -> VerifyResult {
        try await getWithQuery(
            "v1/purchases/verify",
            query: [URLQueryItem(name: "reference", value: reference)]
        )
    }

    /// The buyer's purchase history (includes gifts sent), newest first.
    func purchaseHistory() async throws -> [PurchaseRecord] {
        try await send("v1/purchases", authenticated: true)
    }

    /// GET with real query items. `send(_:)` builds URLs via
    /// `appendingPathComponent`, which percent-encodes `?` and breaks
    /// query-string endpoints — this variant composes the URL correctly.
    private func getWithQuery<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem],
        authenticated: Bool = true,
        retryOn401: Bool = true
    ) async throws -> Response {
        var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = query
        guard let url = components?.url else {
            throw APIError.network("Invalid request URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authenticated, let token = tokenProvider?.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("Invalid response")
        }

        if http.statusCode == 401, authenticated, retryOn401,
           let provider = tokenProvider, await provider.refreshTokens() {
            return try await getWithQuery(path, query: query,
                                          authenticated: authenticated, retryOn401: false)
        }

        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? JSONDecoder().decode(APIError.self, from: data) {
                throw apiError
            }
            throw APIError(status: http.statusCode, title: "Error",
                           detail: "Request failed (\(http.statusCode)).")
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.network("Could not read server response.")
        }
    }
}
